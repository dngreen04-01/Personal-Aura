import { AppState } from 'react-native';
import {
  userDocRef,
  userCollectionRef,
  toFirestoreData,
  fromFirestoreData,
  subscribeToDoc,
  getDocData,
  getCollectionData,
  PROFILE_MAPPING,
  PLAN_MAPPING,
  SESSION_MAPPING,
  SET_MAPPING,
  PREFERENCE_MAPPING,
  LOCATION_MAPPING,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from './firestoreClient';
import {
  getDatabase,
  queueSync,
  getPendingSync,
  markSyncComplete,
  markSyncFailed,
  getSyncState,
  updateSyncState,
} from './database';

let currentUid = null;
let unsubscribers = [];
let appStateSubscription = null;
let processingQueue = false;

export function getCurrentUid() {
  return currentUid;
}

// --- Main entry points ---

export async function initializeSync(uid) {
  currentUid = uid;

  try {
    await Promise.race([
      initialSyncIfNeeded(uid),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Initial sync timed out after 15s')), 15000)),
    ]);
  } catch (err) {
    console.warn('[Sync] Initial sync failed, will retry later:', err.message);
  }

  setupRealtimeListeners(uid);

  // Process queue when app comes to foreground
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && currentUid) {
      processQueue().catch(err =>
        console.warn('[Sync] Queue processing on foreground failed:', err.message)
      );
    }
  });

  return teardownSync;
}

export function teardownSync() {
  for (const unsub of unsubscribers) {
    try { unsub(); } catch (e) { /* ignore */ }
  }
  unsubscribers = [];

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  currentUid = null;
}

// --- Initial sync (new device / first login) ---

async function initialSyncIfNeeded(uid) {
  const profileState = await getSyncState('profile');

  // If we've synced before, just process any pending queue items
  if (profileState?.last_synced_at) {
    processQueue().catch(err =>
      console.warn('[Sync] Queue processing failed:', err.message)
    );
    return;
  }

  // New device — pull data from Firestore
  const now = new Date().toISOString();
  const database = await getDatabase(uid);

  // 1. Profile
  const profileData = await getDocData(userDocRef(uid));
  if (profileData) {
    const local = fromFirestoreData(profileData, PROFILE_MAPPING);
    if (local && local.goal) {
      const existing = await database.getFirstAsync('SELECT id FROM user_profile LIMIT 1');
      if (!existing) {
        const { saveUserProfile } = require('./database');
        await saveUserProfile(
          local.goal, local.equipment, local.experience,
          { age: local.age, weight: local.weight_kg, gender: local.gender },
          { daysPerWeek: local.days_per_week, minutesPerSession: local.minutes_per_session },
          { syncToCloud: false }
        );
      }
    }
  }
  await updateSyncState('profile', now);

  // 2. Active plan
  const plansRef = userCollectionRef(uid, 'plans');
  const activePlanQuery = query(plansRef, where('active', '==', true), limit(1));
  const plans = await getCollectionData(activePlanQuery);
  if (plans.length > 0) {
    const plan = plans[0];
    const local = fromFirestoreData(plan, PLAN_MAPPING);
    if (local?.plan_json) {
      const existing = await database.getFirstAsync('SELECT id FROM workout_plans ORDER BY id DESC LIMIT 1');
      if (!existing) {
        await database.runAsync(
          'INSERT INTO workout_plans (plan_json, updated_at, firestore_id, active) VALUES (?, ?, ?, 1)',
          [local.plan_json, local.updated_at || now, plan.id]
        );
      }
    }
  }
  await updateSyncState('plans', now);

  // 3. Sessions (last 30 days)
  const sessionsRef = userCollectionRef(uid, 'sessions');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sessionsQuery = query(sessionsRef, where('startedAt', '>=', thirtyDaysAgo), orderBy('startedAt', 'desc'));
  const sessions = await getCollectionData(sessionsQuery);

  for (const session of sessions) {
    const local = fromFirestoreData(session, SESSION_MAPPING);
    if (!local) continue;

    // Check if session already exists locally
    const existing = await database.getFirstAsync(
      'SELECT id FROM workout_sessions WHERE firestore_id = ?',
      [session.id]
    );
    if (existing) continue;

    const result = await database.runAsync(
      'INSERT INTO workout_sessions (plan_day, focus, started_at, ended_at, duration_seconds, location_id, updated_at, firestore_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [local.plan_day, local.focus, local.started_at, local.ended_at, local.duration_seconds, local.location_id, local.updated_at || now, session.id]
    );

    // 4. Sets for this session (subcollection)
    const setsRef = userCollectionRef(uid, 'sessions', session.id, 'sets');
    const sets = await getCollectionData(query(setsRef, orderBy('setNumber', 'asc')));
    for (const set of sets) {
      const localSet = fromFirestoreData(set, SET_MAPPING);
      if (!localSet) continue;
      await database.runAsync(
        `INSERT INTO workout_sets (session_id, exercise_name, set_number, weight, weight_unit, reps, rpe, rest_seconds, logged_at, updated_at, firestore_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.lastInsertRowId, localSet.exercise_name, localSet.set_number, localSet.weight, localSet.weight_unit, localSet.reps, localSet.rpe, localSet.rest_seconds, localSet.logged_at, localSet.updated_at || now, set.id]
      );
    }
  }
  await updateSyncState('sessions', now);

  // 5. Preferences
  const prefsData = await getDocData(userDocRef(uid, 'preferences', 'exerciseUnits'));
  if (prefsData) {
    for (const [exerciseName, unit] of Object.entries(prefsData)) {
      if (exerciseName === 'id' || exerciseName === 'updatedAt') continue;
      const { setExerciseUnitPreference } = require('./database');
      await setExerciseUnitPreference(exerciseName, unit, { syncToCloud: false });
    }
  }
  await updateSyncState('preferences', now);

  // 6. Locations
  const locationsRef = userCollectionRef(uid, 'locations');
  const locations = await getCollectionData(query(locationsRef));
  for (const loc of locations) {
    const local = fromFirestoreData(loc, LOCATION_MAPPING);
    if (!local || !local.name) continue;

    const existing = await database.getFirstAsync(
      'SELECT id FROM locations WHERE firestore_id = ?',
      [loc.id]
    );
    if (existing) continue;

    const equipmentStr = typeof local.equipment_list === 'string'
      ? local.equipment_list
      : JSON.stringify(local.equipment_list || []);

    await database.runAsync(
      'INSERT INTO locations (name, equipment_list, is_default, updated_at, firestore_id) VALUES (?, ?, ?, ?, ?)',
      [local.name, equipmentStr, local.is_default || 0, local.updated_at || now, loc.id]
    );
  }
  await updateSyncState('locations', now);
}

// --- Push to cloud (queue-based) ---

export function pushToCloud(collection, documentId, data, operation) {
  if (!currentUid) return;

  // Queue first, then attempt immediate write — chained to avoid race where
  // the Firestore write cleanup runs before the queue INSERT commits.
  queueSync(collection, documentId, operation, { ...data, _uid: currentUid })
    .then(queueId => attemptFirestoreWrite(currentUid, collection, documentId, data, operation, queueId))
    .catch(err => console.warn('[Sync] Push to cloud failed, will retry from queue:', err.message));
}

async function attemptFirestoreWrite(uid, collectionPath, documentId, data, operation, queueId) {
  const ref = buildFirestoreRef(uid, collectionPath, documentId);
  if (!ref) return;

  // Convert local field names to Firestore format
  const mapping = getMappingForCollection(collectionPath);
  const firestoreData = mapping ? toFirestoreData(data, mapping) : data;

  switch (operation) {
    case 'set':
      await setDoc(ref, { ...firestoreData, updatedAt: serverTimestamp() }, { merge: true });
      break;
    case 'update':
      await updateDoc(ref, { ...firestoreData, updatedAt: serverTimestamp() });
      break;
    case 'delete':
      await deleteDoc(ref);
      break;
  }

  // If immediate write succeeds, remove from queue by primary key
  if (queueId) {
    await markSyncComplete(queueId);
  }
}

function buildFirestoreRef(uid, collectionPath, documentId) {
  if (collectionPath === 'profile') {
    return userDocRef(uid);
  }

  // Handle nested paths like "sessions/{sessionFsId}/sets"
  const parts = collectionPath.split('/');
  if (parts.length === 3 && documentId) {
    // e.g. "sessions/abc123/sets" + documentId
    return userDocRef(uid, parts[0], parts[1], parts[2], documentId);
  }

  if (documentId) {
    return userDocRef(uid, collectionPath, documentId);
  }

  return null;
}

function getMappingForCollection(collectionPath) {
  if (collectionPath === 'profile') return PROFILE_MAPPING;
  if (collectionPath === 'plans') return PLAN_MAPPING;
  if (collectionPath === 'sessions') return SESSION_MAPPING;
  if (collectionPath.includes('/sets')) return SET_MAPPING;
  if (collectionPath === 'locations') return LOCATION_MAPPING;
  if (collectionPath === 'preferences') return null; // exercise prefs use dynamic keys
  return null;
}

// --- Queue processor ---

export async function processQueue() {
  if (processingQueue || !currentUid) return;
  processingQueue = true;

  try {
    const pending = await getPendingSync(50);
    if (pending.length === 0) return;

    // Sort: process parent collections before subcollections
    // (sessions before sessions/*/sets)
    pending.sort((a, b) => {
      const aDepth = (a.collection || '').split('/').length;
      const bDepth = (b.collection || '').split('/').length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    for (const item of pending) {
      try {
        const data = JSON.parse(item.data);
        const uid = data._uid || currentUid;
        delete data._uid;

        await attemptFirestoreWriteDirect(uid, item.collection, item.document_id, data, item.operation);
        await markSyncComplete(item.id);
      } catch (err) {
        console.warn(`[Sync] Queue item ${item.id} failed:`, err.message);
        await markSyncFailed(item.id, err.message);
      }
    }

    // Check if more items remain
    const remaining = await getPendingSync(1);
    if (remaining.length > 0) {
      // Recurse after a small delay
      setTimeout(() => {
        processQueue().catch(() => {});
      }, 500);
    }
  } finally {
    processingQueue = false;
  }
}

async function attemptFirestoreWriteDirect(uid, collectionPath, documentId, data, operation) {
  const ref = buildFirestoreRef(uid, collectionPath, documentId);
  if (!ref) throw new Error(`Cannot build ref for ${collectionPath}/${documentId}`);

  const mapping = getMappingForCollection(collectionPath);
  const firestoreData = mapping ? toFirestoreData(data, mapping) : data;

  switch (operation) {
    case 'set':
      await setDoc(ref, { ...firestoreData, updatedAt: serverTimestamp() }, { merge: true });
      break;
    case 'update':
      await updateDoc(ref, { ...firestoreData, updatedAt: serverTimestamp() });
      break;
    case 'delete':
      await deleteDoc(ref);
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// --- Real-time listeners ---

function setupRealtimeListeners(uid) {
  // Profile listener
  const profileRef = userDocRef(uid);
  const unsubProfile = subscribeToDoc(profileRef, async (data) => {
    if (!data) return;
    if (!currentUid) return;
    try {
      const database = await getDatabase(uid);
      const localProfile = await database.getFirstAsync('SELECT updated_at FROM user_profile ORDER BY id DESC LIMIT 1');
      const remoteUpdatedAt = data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : data.updatedAt;

      // Only update if remote is newer
      if (!localProfile?.updated_at || (remoteUpdatedAt && remoteUpdatedAt > localProfile.updated_at)) {
        const local = fromFirestoreData(data, PROFILE_MAPPING);
        if (local && local.goal) {
          await database.runAsync(
            `UPDATE user_profile SET
              goal = ?, equipment = ?, experience = ?, age = ?, weight_kg = ?, gender = ?,
              days_per_week = ?, minutes_per_session = ?, updated_at = ?
            WHERE id = (SELECT id FROM user_profile ORDER BY id DESC LIMIT 1)`,
            [local.goal, local.equipment, local.experience, local.age, local.weight_kg, local.gender,
             local.days_per_week, local.minutes_per_session, remoteUpdatedAt || new Date().toISOString()]
          );
        }
      }
    } catch (err) {
      console.warn('[Sync] Profile listener update failed:', err.message);
    }
  });
  unsubscribers.push(unsubProfile);

  // Active plan listener (collection query — use onSnapshot directly)
  const plansRef = userCollectionRef(uid, 'plans');
  const activePlanQuery = query(plansRef, where('active', '==', true), limit(1));
  const { onSnapshot: fsOnSnapshot } = require('firebase/firestore');
  const unsubActivePlan = fsOnSnapshot(activePlanQuery, async (snapshot) => {
    if (snapshot.empty) return;
    if (!currentUid) return;
    try {
      const planDoc = snapshot.docs[0];
      const planData = planDoc.data();
      const database = await getDatabase(uid);

      const localPlan = await database.getFirstAsync(
        'SELECT updated_at, firestore_id FROM workout_plans WHERE active = 1 ORDER BY id DESC LIMIT 1'
      );

      const remoteUpdatedAt = planData.updatedAt?.toDate?.() ? planData.updatedAt.toDate().toISOString() : planData.updatedAt;

      if (!localPlan?.updated_at || (remoteUpdatedAt && remoteUpdatedAt > localPlan.updated_at)) {
        const local = fromFirestoreData(planData, PLAN_MAPPING);
        if (local?.plan_json) {
          // Deactivate old plans
          await database.runAsync('UPDATE workout_plans SET active = 0');
          // Insert or update
          const existing = await database.getFirstAsync(
            'SELECT id FROM workout_plans WHERE firestore_id = ?',
            [planDoc.id]
          );
          if (existing) {
            await database.runAsync(
              'UPDATE workout_plans SET plan_json = ?, updated_at = ?, active = 1 WHERE id = ?',
              [local.plan_json, remoteUpdatedAt || new Date().toISOString(), existing.id]
            );
          } else {
            await database.runAsync(
              'INSERT INTO workout_plans (plan_json, updated_at, firestore_id, active) VALUES (?, ?, ?, 1)',
              [local.plan_json, remoteUpdatedAt || new Date().toISOString(), planDoc.id]
            );
          }
        }
      }
    } catch (err) {
      console.warn('[Sync] Plan listener update failed:', err.message);
    }
  }, (error) => {
    console.warn('[Sync] Active plan listener error:', error);
  });
  unsubscribers.push(unsubActivePlan);
}
