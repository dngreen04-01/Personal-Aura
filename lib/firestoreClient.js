import {
  doc,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { firestore } from './firebase';

// --- Path builders ---

export function userDocRef(uid, ...pathSegments) {
  return doc(firestore, 'users', uid, ...pathSegments);
}

export function userCollectionRef(uid, ...pathSegments) {
  return collection(firestore, 'users', uid, ...pathSegments);
}

// Generate a Firestore document ID client-side (no network call)
export function generateFirestoreId(collectionPath, uid) {
  return doc(collection(firestore, 'users', uid, collectionPath)).id;
}

// --- Field mappings ---

export const PROFILE_MAPPING = {
  goal: 'goal',
  equipment: 'equipment',
  experience: 'experience',
  age: 'age',
  weight_kg: 'weightKg',
  gender: 'gender',
  days_per_week: 'daysPerWeek',
  minutes_per_session: 'minutesPerSession',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

export const SESSION_MAPPING = {
  plan_day: 'planDay',
  focus: 'focus',
  started_at: 'startedAt',
  ended_at: 'endedAt',
  duration_seconds: 'durationSeconds',
  location_id: 'locationId',
  updated_at: 'updatedAt',
};

export const SET_MAPPING = {
  session_id: 'sessionId',
  exercise_name: 'exerciseName',
  set_number: 'setNumber',
  weight: 'weight',
  weight_unit: 'weightUnit',
  reps: 'reps',
  rpe: 'rpe',
  rest_seconds: 'restSeconds',
  logged_at: 'loggedAt',
  updated_at: 'updatedAt',
};

export const PLAN_MAPPING = {
  plan_json: 'planJson',
  version: 'version',
  active: 'active',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

export const LOCATION_MAPPING = {
  name: 'name',
  equipment_list: 'equipment',
  is_default: 'isDefault',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

export const PREFERENCE_MAPPING = {
  exercise_name: 'exerciseName',
  weight_unit: 'weightUnit',
  updated_at: 'updatedAt',
};

// --- Serialization ---

// JSON fields that need parse/stringify
const JSON_FIELDS = new Set(['plan_json', 'equipment_list']);

export function toFirestoreData(localRow, mapping) {
  const data = {};
  for (const [localKey, firestoreKey] of Object.entries(mapping)) {
    if (localKey in localRow && localRow[localKey] !== undefined) {
      let value = localRow[localKey];
      if (JSON_FIELDS.has(localKey) && typeof value === 'string') {
        try { value = JSON.parse(value); } catch (e) { /* keep as string */ }
      }
      data[firestoreKey] = value;
    }
  }
  return data;
}

export function fromFirestoreData(snapshotOrData, mapping) {
  const data = snapshotOrData.data ? snapshotOrData.data() : snapshotOrData;
  if (!data) return null;

  const localRow = {};
  // Build reverse mapping: firestoreKey -> localKey
  for (const [localKey, firestoreKey] of Object.entries(mapping)) {
    if (firestoreKey in data && data[firestoreKey] !== undefined) {
      let value = data[firestoreKey];
      if (JSON_FIELDS.has(localKey) && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      // Convert boolean isDefault to integer for SQLite
      if (localKey === 'is_default') {
        value = value ? 1 : 0;
      }
      localRow[localKey] = value;
    }
  }
  return localRow;
}

// --- Batch writes ---

const MAX_BATCH_SIZE = 500;

export async function batchWrite(operations) {
  // Split into chunks of 500 (Firestore batch limit)
  for (let i = 0; i < operations.length; i += MAX_BATCH_SIZE) {
    const chunk = operations.slice(i, i + MAX_BATCH_SIZE);
    const batch = writeBatch(firestore);

    for (const op of chunk) {
      switch (op.operation) {
        case 'set':
          batch.set(op.ref, { ...op.data, updatedAt: serverTimestamp() }, { merge: op.merge || false });
          break;
        case 'update':
          batch.update(op.ref, { ...op.data, updatedAt: serverTimestamp() });
          break;
        case 'delete':
          batch.delete(op.ref);
          break;
      }
    }

    await batch.commit();
  }
}

// --- Listeners ---

export function subscribeToDoc(ref, callback) {
  return onSnapshot(ref, (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null, snapshot);
  }, (error) => {
    console.warn('[Firestore] Doc listener error:', error);
  });
}

export function subscribeToCollection(queryRef, callback) {
  return onSnapshot(queryRef, (snapshot) => {
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(docs, snapshot);
  }, (error) => {
    console.warn('[Firestore] Collection listener error:', error);
  });
}

// --- Direct read helpers ---

export async function getDocData(ref) {
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getCollectionData(queryRef) {
  const snap = await getDocs(queryRef);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Re-export Firestore query helpers for use in sync.js
export { query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, getDocs, serverTimestamp };
