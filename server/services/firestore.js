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
};
