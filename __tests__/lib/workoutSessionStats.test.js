/**
 * Which workout sessions count toward streaks and totals.
 *
 * Tests marked `test.failing` reproduce bugs from the app review (see
 * sync.test.js for the convention).
 */
const db = require('../../lib/database');

function uid() { return `stats_${Math.random().toString(36).slice(2)}`; }

beforeEach(async () => { await db.getDatabase(uid()); });
afterEach(async () => { await db.closeDatabase(); });

async function finishedWorkout() {
  const sid = await db.startSession(1, 'Push', null, { syncToCloud: false });
  await db.logSet(sid, 'Bench Press', 1, 60, 'kg', 8, null, 90, { syncToCloud: false });
  await db.endSession(sid, { syncToCloud: false });
  return sid;
}

test('a finished workout with logged sets counts as completed and starts a streak', async () => {
  await finishedWorkout();
  expect(await db.getCompletedSessionCount()).toBe(1);
  expect((await db.getWorkoutStreak()).current).toBe(1);
});

test('a workout still in progress does not count', async () => {
  await db.startSession(1, 'Push', null, { syncToCloud: false });
  expect(await db.getCompletedSessionCount()).toBe(0);
});

test('session stats total the logged sets and volume', async () => {
  const sid = await db.startSession(1, 'Push', null, { syncToCloud: false });
  await db.logSet(sid, 'Bench Press', 1, 60, 'kg', 8, null, 90, { syncToCloud: false });
  await db.logSet(sid, 'Bench Press', 2, 60, 'kg', 6, null, 90, { syncToCloud: false });
  await db.endSession(sid, { syncToCloud: false });
  expect(await db.getSessionStats(sid)).toMatchObject({ total_sets: 2, total_volume: 840, exercises_done: 1 });
});

// Review: "Tapping X ends the workout without asking and counts it as
// completed." X calls endSession, which stamps ended_at the same way a real
// finish does, so an abandoned workout with nothing logged counts.
test.failing('a workout closed with no sets logged does not count as completed', async () => {
  const sid = await db.startSession(1, 'Push', null, { syncToCloud: false });
  await db.endSession(sid, { syncToCloud: false });
  expect(await db.getCompletedSessionCount()).toBe(0);
  expect((await db.getWorkoutStreak()).current).toBe(0);
});

// Review: "Stop discarded workouts counting toward stats." Choosing Discard
// on the resume prompt also stamps ended_at.
test.failing('a discarded workout does not count as completed', async () => {
  const sid = await db.startSession(1, 'Push', null, { syncToCloud: false });
  await db.discardSession(sid);
  expect(await db.getCompletedSessionCount()).toBe(0);
});
