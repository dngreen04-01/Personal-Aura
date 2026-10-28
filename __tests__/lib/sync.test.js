/**
 * lib/sync — Firestore sync: the outbound queue, restore on a new device, and
 * realtime listeners.
 *
 * SQLite is real (better-sqlite3 behind the expo-sqlite mock) and Firestore is
 * the in-memory fake in __tests__/__helpers__/fakeFirestore.js. The fake keeps
 * its data across jest.resetModules(), so a test can write from one "device",
 * reset every module (which also wipes SQLite), and restore on a second one.
 *
 * Tests marked `test.failing` reproduce bugs from the app review. They pass
 * today because the bug is present; when a fix lands Jest reports them as
 * failing, which is the cue to flip them to a plain `test`.
 */
jest.mock('firebase/firestore', () => require('../__helpers__/fakeFirestore'));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o) => o.ios || o.default },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

const UID = 'user-1';

const flush = async (n = 30) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

// A fresh app install: new module instances, empty SQLite, same Firestore.
async function newDevice({ sync = true } = {}) {
  jest.resetModules();
  const db = require('../../lib/database');
  const syncLib = require('../../lib/sync');
  const fs = require('firebase/firestore').__fake;
  await db.getDatabase(UID);
  if (sync) {
    await syncLib.initializeSync(UID);
    await flush();
  }
  return { db, sync: syncLib, fs, sql: await db.getDatabase(UID) };
}

// Everything a returning user has in the cloud, written through the app's own
// save functions so the documents look exactly like production ones.
async function seedCloudFromFirstDevice() {
  const { db, sync } = await newDevice();
  await db.saveUserProfile('strength', 'full_gym', 'intermediate',
    { age: 34, weight: 82, gender: 'male' },
    { daysPerWeek: 4, minutesPerSession: 60 },
    { injuriesJson: [{ area: 'left shoulder', severity: 'mild' }], goalsJson: { primary: 'strength' } });
  await db.saveWorkoutPlan({ days: [{ day: 1, focus: 'Push', exercises: [{ name: 'Bench Press', sets: 3, reps: 8 }] }] });
  const sessionId = await db.startSession(1, 'Push');
  await flush();
  await db.logSet(sessionId, 'Bench Press', 1, 80, 'kg', 8, 8, 90);
  await db.logSet(sessionId, 'Bench Press', 2, 80, 'kg', 7, 9, 90);
  await flush();
  await db.endSession(sessionId);
  await db.setExerciseUnitPreference('Bench Press', 'lbs');
  await flush();
  sync.teardownSync();
}

beforeEach(() => {
  // Fake timers keep initializeSync's 15s timeout and processQueue's 500ms
  // reschedule from outliving the test. setImmediate stays real for flush().
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  require('firebase/firestore').__fake.reset();
  require('@react-native-async-storage/async-storage').default.__reset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  try { require('../../lib/sync').teardownSync(); } catch {}
  await require('../../lib/database').closeDatabase();
  require('expo-sqlite').__resetAll();
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('pushing local changes', () => {
  test('a saved profile is written to users/{uid} with Firestore field names', async () => {
    const { db, fs } = await newDevice();
    await db.saveUserProfile('hypertrophy', 'dumbbells', 'beginner', { age: 30, weight: 70 }, { daysPerWeek: 3 });
    await flush();
    expect(fs.get(`users/${UID}`)).toMatchObject({
      goal: 'hypertrophy', equipment: 'dumbbells', weightKg: 70, daysPerWeek: 3,
    });
  });

  test('a successful write leaves nothing in the queue', async () => {
    const { db, sql } = await newDevice();
    await db.saveUserProfile('strength', 'full_gym', 'beginner');
    await flush();
    const { n } = await sql.getFirstAsync('SELECT COUNT(*) AS n FROM sync_queue');
    expect(n).toBe(0);
  });

  test('a set lands under its session in Firestore', async () => {
    const { db, fs } = await newDevice();
    const sid = await db.startSession(1, 'Push');
    await flush();
    await db.logSet(sid, 'Bench Press', 1, 60, 'kg', 8, null, 90);
    await flush();
    const setPaths = fs.paths().filter((p) => /sessions\/[^/]+\/sets\//.test(p));
    expect(setPaths).toHaveLength(1);
    expect(fs.get(setPaths[0])).toMatchObject({ exerciseName: 'Bench Press', setNumber: 1, weight: 60, reps: 8 });
  });

  test('nothing is queued or written when signed out', async () => {
    const { db, sql, fs } = await newDevice({ sync: false });
    await db.saveUserProfile('strength', 'full_gym', 'beginner');
    await flush();
    const { n } = await sql.getFirstAsync('SELECT COUNT(*) AS n FROM sync_queue');
    expect(n).toBe(0);
    expect(fs.paths()).toHaveLength(0);
  });

  // Review: "Injuries and goals are never synced at all." saveUserProfile adds
  // injuries_json / goals_json to the payload, but PROFILE_MAPPING has no
  // entry for them, so toFirestoreData drops them before the write.
  test.failing('injuries and goals reach Firestore with the profile', async () => {
    const { db, fs } = await newDevice();
    await db.saveUserProfile('strength', 'full_gym', 'beginner', {}, {}, {
      injuriesJson: [{ area: 'knee' }], goalsJson: { primary: 'strength' },
    });
    await flush();
    const profile = fs.get(`users/${UID}`);
    expect(JSON.stringify(profile)).toContain('knee');
    expect(JSON.stringify(profile)).toContain('primary');
  });
});

describe('offline queue', () => {
  test('a failed write stays queued and is delivered by the next processQueue', async () => {
    const { db, sync, sql, fs } = await newDevice();
    fs.fail('setDoc', { path: /^users\/user-1$/ });
    await db.saveUserProfile('strength', 'full_gym', 'beginner');
    await flush();

    let row = await sql.getFirstAsync('SELECT * FROM sync_queue');
    expect(row).toMatchObject({ collection: 'profile', status: 'pending' });
    expect(fs.get(`users/${UID}`)).toBeUndefined();

    await sync.processQueue();
    await flush();
    row = await sql.getFirstAsync('SELECT * FROM sync_queue');
    expect(row).toBeNull();
    expect(fs.get(`users/${UID}`)).toMatchObject({ goal: 'strength' });
  });

  test('queued sessions are written before their sets', async () => {
    const { db, sync, fs } = await newDevice();
    fs.fail('*', { times: Infinity, message: 'offline' });
    const sid = await db.startSession(1, 'Push');
    await flush();
    await db.logSet(sid, 'Bench Press', 1, 60, 'kg', 8, null, 90);
    await flush();

    fs.state.failures = [];
    await sync.processQueue();
    await flush();
    const order = fs.state.writes.map((w) => (w.path.includes('/sets/') ? 'set' : 'session'));
    expect(order).toEqual(['session', 'set']);
  });

  test('an item that keeps failing is marked failed after 5 attempts and counted', async () => {
    const { db, sync, fs, sql } = await newDevice();
    fs.fail('setDoc', { times: Infinity, message: 'permission-denied' });
    await db.saveUserProfile('strength', 'full_gym', 'beginner');
    await flush();

    // One immediate attempt already happened; drive the rest by hand.
    await sql.runAsync("UPDATE sync_queue SET retry_count = 0");
    for (let i = 0; i < 5; i++) {
      await sync.processQueue();
      await flush();
    }
    const row = await sql.getFirstAsync('SELECT status, retry_count, last_error FROM sync_queue');
    expect(row).toMatchObject({ status: 'failed', retry_count: 5, last_error: 'permission-denied' });
    expect(await db.getFailedSyncCount()).toBe(1);
  });

  // Review: "retry backoff". processQueue reschedules itself 500ms later
  // while anything is pending, and a failed item goes straight back to
  // pending, so a short outage burns all 5 retries in about 2 seconds and the
  // change is never synced.
  test.failing('a short outage does not use up every retry', async () => {
    const { db, sync, fs, sql } = await newDevice();
    fs.fail('setDoc', { times: Infinity, message: 'unavailable' });
    await db.saveUserProfile('strength', 'full_gym', 'beginner');
    await flush();

    await sync.processQueue();
    // Let the self-rescheduling loop run for ~3 seconds of an outage.
    for (let i = 0; i < 6; i++) {
      jest.advanceTimersByTime(550);
      await flush();
    }
    const row = await sql.getFirstAsync('SELECT status FROM sync_queue');
    expect(row.status).toBe('pending');
  });
});

describe('restore on a new device', () => {
  test('a returning user gets their profile back and is treated as onboarded', async () => {
    await seedCloudFromFirstDevice();
    const { db } = await newDevice();
    expect(await db.hasCompletedOnboarding()).toBe(true);
    expect(await db.getUserProfile()).toMatchObject({ goal: 'strength', equipment: 'full_gym', weight_kg: 82 });
  });

  test('an empty account restores nothing and does not throw', async () => {
    const { db } = await newDevice();
    expect(await db.hasCompletedOnboarding()).toBe(false);
  });

  // Review: "Restore crashes partway through." Every document the app writes
  // gets updatedAt: serverTimestamp(), which comes back as a Timestamp
  // object. Restore passes it straight into a SQLite insert for the plan and
  // each session, and SQLite rejects it, so nothing after the profile lands.
  test.failing('the active plan comes back', async () => {
    await seedCloudFromFirstDevice();
    const { db } = await newDevice();
    expect(await db.getLatestPlan()).toMatchObject({ days: [expect.objectContaining({ focus: 'Push' })] });
  });

  test.failing('workout history comes back with every set', async () => {
    await seedCloudFromFirstDevice();
    const { sql } = await newDevice();
    const sessions = await sql.getAllAsync('SELECT * FROM workout_sessions');
    expect(sessions).toHaveLength(1);
    const sets = await sql.getAllAsync('SELECT * FROM workout_sets ORDER BY set_number');
    expect(sets.map((s) => [s.set_number, s.weight, s.reps])).toEqual([[1, 80, 8], [2, 80, 7]]);
  });

  test.failing('per-exercise unit preferences come back', async () => {
    await seedCloudFromFirstDevice();
    const { db } = await newDevice();
    expect(await db.getExerciseUnitPreference('Bench Press')).toBe('lbs');
  });

  // Review: "...and never retries, so your history never comes down." The
  // profile is marked synced before the rest of the restore runs, and the
  // next launch only checks that marker, so a restore that failed once is
  // never attempted again.
  test.failing('a restore that fails partway is retried on the next launch', async () => {
    await seedCloudFromFirstDevice();
    require('firebase/firestore').__fake.fail('getDocs', { path: /\/sessions$/, message: 'deadline-exceeded' });
    const { sync, sql } = await newDevice();

    // Next launch on the same device, with the network back.
    sync.teardownSync();
    await sync.initializeSync(UID);
    await flush();

    const sessions = await sql.getAllAsync('SELECT * FROM workout_sessions');
    expect(sessions).toHaveLength(1);
  });

  // Review: "Injuries and goals are never synced at all."
  test.failing('injuries and goals come back with the profile', async () => {
    await seedCloudFromFirstDevice();
    const { db } = await newDevice();
    const profile = await db.getUserProfile();
    expect(JSON.parse(profile.injuries_json || 'null')).toEqual([{ area: 'left shoulder', severity: 'mild' }]);
  });
});

describe('realtime listeners', () => {
  test('a newer profile from another device replaces the local one', async () => {
    const { db, fs } = await newDevice();
    await db.saveUserProfile('strength', 'full_gym', 'beginner');
    await flush();

    const { setDoc, doc } = require('firebase/firestore');
    await setDoc(doc(null, 'users', UID), { goal: 'endurance', equipment: 'bodyweight', updatedAt: new fs.Timestamp(new Date(Date.now() + 60000)) }, { merge: true });
    await flush();
    expect(await db.getUserProfile()).toMatchObject({ goal: 'endurance', equipment: 'bodyweight' });
  });

  test('an older remote profile does not overwrite a newer local edit', async () => {
    const { db, fs } = await newDevice();
    await db.saveUserProfile('strength', 'full_gym', 'beginner');
    await flush();

    const { setDoc, doc } = require('firebase/firestore');
    await setDoc(doc(null, 'users', UID), { goal: 'endurance', equipment: 'bodyweight', updatedAt: '2000-01-01T00:00:00.000Z' }, { merge: true });
    await flush();
    expect(await db.getUserProfile()).toMatchObject({ goal: 'strength' });
  });

  test('a plan made active on another device becomes the local active plan', async () => {
    const { db, sql, fs } = await newDevice();
    await db.saveWorkoutPlan({ days: [{ day: 1, focus: 'Old plan' }] });
    await flush();

    const { setDoc, doc } = require('firebase/firestore');
    for (const p of fs.paths().filter((x) => x.includes('/plans/'))) {
      await setDoc(doc(null, p), { active: false }, { merge: true });
    }
    await setDoc(doc(null, 'users', UID, 'plans', 'from-tablet'), {
      planJson: { days: [{ day: 1, focus: 'New plan' }] }, active: true,
      updatedAt: new fs.Timestamp(new Date(Date.now() + 60000)),
    });
    await flush();

    const active = await sql.getAllAsync('SELECT firestore_id, plan_json FROM workout_plans WHERE active = 1');
    expect(active).toHaveLength(1);
    expect(active[0].firestore_id).toBe('from-tablet');
    expect(JSON.parse(active[0].plan_json).days[0].focus).toBe('New plan');
  });

  test('signing out stops the listeners', async () => {
    const { sync, fs } = await newDevice();
    expect(fs.listenerCount()).toBeGreaterThan(0);
    sync.teardownSync();
    expect(fs.listenerCount()).toBe(0);
    expect(sync.getCurrentUid()).toBeNull();
  });
});
