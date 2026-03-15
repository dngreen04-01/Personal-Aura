const admin = require('firebase-admin');

// Reuses the same admin.initializeApp() guard from middleware/auth.js
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

// --- Read helpers ---

async function getUserProfile(uid) {
  const snap = await db.doc(`users/${uid}/profile/main`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function getUserActivePlan(uid) {
  const q = db.collection(`users/${uid}/plans`)
    .where('active', '==', true)
    .limit(1);
  const snap = await q.get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getUserSessions(uid, { days = 7 } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();

  const q = db.collection(`users/${uid}/sessions`)
    .where('startedAt', '>=', sinceISO)
    .orderBy('startedAt', 'desc');
  const snap = await q.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getSessionSets(uid, sessionId) {
  const snap = await db.collection(`users/${uid}/sessions/${sessionId}/sets`).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getCompletedSessionCount(uid, sinceDays = 30) {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceISO = since.toISOString();

  const q = db.collection(`users/${uid}/sessions`)
    .where('startedAt', '>=', sinceISO);
  const snap = await q.get();
  return snap.size;
}

async function getWorkoutStreak(uid) {
  // Get last 90 days of sessions, ordered by date
  const q = db.collection(`users/${uid}/sessions`)
    .orderBy('startedAt', 'desc')
    .limit(100);
  const snap = await q.get();

  if (snap.empty) return { current: 0, longest: 0, lastWorkoutDate: null };

  const sessionDates = new Set();
  let lastWorkoutDate = null;

  for (const doc of snap.docs) {
    const data = doc.data();
    const dateStr = data.startedAt?.substring(0, 10); // YYYY-MM-DD
    if (dateStr) {
      sessionDates.add(dateStr);
      if (!lastWorkoutDate) lastWorkoutDate = dateStr;
    }
  }

  // Compute streak: consecutive days working backward from today
  let current = 0;
  const today = new Date();
  const checkDate = new Date(today);

  // Allow today or yesterday as the starting point
  if (!sessionDates.has(formatDate(checkDate))) {
    checkDate.setDate(checkDate.getDate() - 1);
    if (!sessionDates.has(formatDate(checkDate))) {
      return { current: 0, longest: 0, lastWorkoutDate };
    }
  }

  while (sessionDates.has(formatDate(checkDate))) {
    current++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return { current, longest: current, lastWorkoutDate };
}

// --- Write helpers ---

async function saveNewPlan(uid, planJson, generatedBy) {
  const plansRef = db.collection(`users/${uid}/plans`);

  // Deactivate current active plan
  const activeSnap = await plansRef.where('active', '==', true).get();
  const batch = db.batch();

  for (const doc of activeSnap.docs) {
    batch.update(doc.ref, { active: false, updatedAt: new Date().toISOString() });
  }

  // Get next version number
  const allPlans = await plansRef.orderBy('version', 'desc').limit(1).get();
  const nextVersion = allPlans.empty ? 1 : (allPlans.docs[0].data().version || 0) + 1;

  // Create new plan
  const newPlanRef = plansRef.doc();
  batch.set(newPlanRef, {
    planJson: typeof planJson === 'string' ? planJson : JSON.stringify(planJson),
    version: nextVersion,
    active: true,
    generatedBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await batch.commit();
  return newPlanRef.id;
}

async function saveInsight(uid, weekId, data) {
  await db.doc(`users/${uid}/insights/${weekId}`).set({
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function updateUserProfile(uid, fields) {
  await db.doc(`users/${uid}/profile/main`).update({
    ...fields,
    updatedAt: new Date().toISOString(),
  });
}

// --- Query helpers ---

async function getAllUserUids(filter = {}) {
  const usersSnap = await db.collectionGroup('profile').get();
  const uids = [];

  for (const doc of usersSnap.docs) {
    // Path: users/{uid}/profile/main
    const uid = doc.ref.parent.parent.id;
    const data = doc.data();

    if (filter.hasSessionsSince) {
      const sessionCount = await getCompletedSessionCount(uid, filter.hasSessionsSince);
      if (sessionCount === 0) continue;
    }

    if (filter.hasPushToken && !data.pushToken) continue;

    uids.push(uid);
  }

  return uids;
}

// --- Exercise Library ---

async function getExercises({ category, equipment, difficulty, muscle, search, limit = 50, startAfter } = {}) {
  let query = db.collection('exercises');

  if (category) query = query.where('category', '==', category);
  if (difficulty) query = query.where('difficulty', '==', difficulty);
  if (equipment) query = query.where('equipment', 'array-contains', equipment);
  if (muscle) query = query.where('primaryMuscles', 'array-contains', muscle);

  query = query.limit(limit + 1);

  if (startAfter) {
    const cursorDoc = await db.doc(`exercises/${startAfter}`).get();
    if (cursorDoc.exists) query = query.startAfter(cursorDoc);
  }

  const snap = await query.get();
  let exercises = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Client-side text search (acceptable for ~100 exercises)
  if (search) {
    const term = search.toLowerCase();
    exercises = exercises.filter(e => e.name.toLowerCase().includes(term));
  }

  const hasMore = exercises.length > limit;
  if (hasMore) exercises = exercises.slice(0, limit);

  return { exercises, hasMore };
}

async function getExerciseById(exerciseId) {
  const snap = await db.doc(`exercises/${exerciseId}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function getExercisesByNames(names) {
  if (!names || names.length === 0) return [];

  const results = [];
  // Firestore 'in' queries limited to 30 per query
  for (let i = 0; i < names.length; i += 30) {
    const chunk = names.slice(i, i + 30);
    const snap = await db.collection('exercises')
      .where('name', 'in', chunk)
      .get();
    results.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }
  return results;
}

async function getExerciseAlternatives(exerciseId) {
  const exercise = await getExerciseById(exerciseId);
  if (!exercise || !exercise.alternatives || exercise.alternatives.length === 0) {
    return [];
  }

  const results = [];
  for (const slug of exercise.alternatives) {
    const alt = await getExerciseById(slug);
    if (alt) results.push(alt);
  }
  return results;
}

// --- Shared Locations ---

async function getSharedLocations({ lat, lon, radiusKm = 25, search, limit = 50 } = {}) {
  const { calculateDistance } = require('./geoUtils');
  const snap = await db.collection('sharedLocations').get();
  let locations = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Filter by distance if coordinates provided
  if (lat != null && lon != null) {
    locations = locations
      .map(loc => ({
        ...loc,
        distance: calculateDistance(lat, lon, loc.lat, loc.lon),
      }))
      .filter(loc => loc.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  }

  // Text search on name/address
  if (search) {
    const term = search.toLowerCase();
    locations = locations.filter(
      loc =>
        (loc.name || '').toLowerCase().includes(term) ||
        (loc.address || '').toLowerCase().includes(term)
    );
  }

  return locations.slice(0, limit);
}

async function getSharedLocationById(locationId) {
  const snap = await db.doc(`sharedLocations/${locationId}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function createSharedLocation({ name, address, lat, lon, equipment, createdBy }) {
  const ref = db.collection('sharedLocations').doc();
  const now = new Date().toISOString();
  await ref.set({
    name,
    address: address || '',
    lat,
    lon,
    equipment: equipment || [],
    contributors: [createdBy],
    verified: false,
    equipmentVotes: {},
    missingVotes: {},
    createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id };
}

async function addEquipmentContribution(locationId, uid, equipmentId) {
  const ref = db.doc(`sharedLocations/${locationId}`);
  await ref.update({
    equipment: admin.firestore.FieldValue.arrayUnion(equipmentId),
    contributors: admin.firestore.FieldValue.arrayUnion(uid),
    [`equipmentVotes.${equipmentId}`]: admin.firestore.FieldValue.arrayUnion(uid),
    updatedAt: new Date().toISOString(),
  });
}

async function reportMissingEquipment(locationId, uid, equipmentId) {
  const ref = db.doc(`sharedLocations/${locationId}`);
  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data();
  const missingVotes = data.missingVotes || {};
  const voters = missingVotes[equipmentId] || [];

  if (voters.includes(uid)) return; // Already reported

  const updatedVoters = [...voters, uid];
  const update = {
    [`missingVotes.${equipmentId}`]: updatedVoters,
    updatedAt: new Date().toISOString(),
  };

  // Auto-remove equipment at 2+ votes
  if (updatedVoters.length >= 2) {
    update.equipment = admin.firestore.FieldValue.arrayRemove(equipmentId);
  }

  await ref.update(update);
}

async function claimSharedLocation(locationId, uid) {
  const ref = db.doc(`sharedLocations/${locationId}`);
  await ref.update({
    contributors: admin.firestore.FieldValue.arrayUnion(uid),
    updatedAt: new Date().toISOString(),
  });
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

// --- Utilities ---

function formatDate(date) {
  return date.toISOString().substring(0, 10);
}

function getFirestore() {
  return db;
}

module.exports = {
  getFirestore,
  getUserProfile,
  getUserActivePlan,
  getUserSessions,
  getSessionSets,
  getCompletedSessionCount,
  getWorkoutStreak,
  saveNewPlan,
  saveInsight,
  updateUserProfile,
  getAllUserUids,
  getExercises,
  getExerciseById,
  getExercisesByNames,
  getExerciseAlternatives,
  getSharedLocations,
  getSharedLocationById,
  createSharedLocation,
  addEquipmentContribution,
  reportMissingEquipment,
  claimSharedLocation,
};
