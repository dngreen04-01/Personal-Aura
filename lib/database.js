import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AURA_UID_KEY = '@aura_active_uid';

let db = null;
let currentDbName = null;

export async function getDatabase(uid = null) {
  const dbName = uid ? `aura_${uid}.db` : (currentDbName || 'aura.db');
  if (db && currentDbName === dbName) return db;
  if (db) {
    try { await db.closeAsync(); } catch (e) { /* already closed */ }
  }
  db = await SQLite.openDatabaseAsync(dbName);
  currentDbName = dbName;
  await initializeDatabase(db);
  return db;
}

export async function closeDatabase() {
  if (db) {
    try { await db.closeAsync(); } catch (e) { /* already closed */ }
    db = null;
    currentDbName = null;
  }
}

export async function persistActiveUid(uid) {
  try {
    if (uid) {
      await AsyncStorage.setItem(AURA_UID_KEY, uid);
    } else {
      await AsyncStorage.removeItem(AURA_UID_KEY);
    }
  } catch {
    // Non-critical: background handler degrades gracefully
  }
}

export async function getPersistedUid() {
  try {
    return await AsyncStorage.getItem(AURA_UID_KEY);
  } catch {
    return null;
  }
}

async function initializeDatabase(database) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal TEXT NOT NULL,
      equipment TEXT NOT NULL,
      experience TEXT,
      age INTEGER,
      weight_kg REAL,
      gender TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );`);

  // Migrate: add columns if missing on older databases
  const columns = await database.getAllAsync("PRAGMA table_info(user_profile)");
  const colNames = columns.map(c => c.name);
  if (!colNames.includes('age')) await database.execAsync('ALTER TABLE user_profile ADD COLUMN age INTEGER');
  if (!colNames.includes('weight_kg')) await database.execAsync('ALTER TABLE user_profile ADD COLUMN weight_kg REAL');
  if (!colNames.includes('gender')) await database.execAsync('ALTER TABLE user_profile ADD COLUMN gender TEXT');
  if (!colNames.includes('days_per_week')) await database.execAsync('ALTER TABLE user_profile ADD COLUMN days_per_week INTEGER');
  if (!colNames.includes('minutes_per_session')) await database.execAsync('ALTER TABLE user_profile ADD COLUMN minutes_per_session INTEGER');
  if (!colNames.includes('updated_at')) await database.execAsync('ALTER TABLE user_profile ADD COLUMN updated_at TEXT');

  await database.execAsync(`

    CREATE TABLE IF NOT EXISTS workout_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_json TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_day TEXT,
      focus TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      duration_seconds INTEGER
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      exercise_name TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL,
      weight_unit TEXT DEFAULT 'kg',
      reps INTEGER,
      rpe REAL,
      rest_seconds INTEGER,
      logged_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES workout_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS exercise_unit_preferences (
      exercise_name TEXT NOT NULL UNIQUE,
      weight_unit TEXT NOT NULL DEFAULT 'kg',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      user_message TEXT,
      agents_invoked TEXT,
      orchestrator_latency_ms INTEGER,
      total_latency_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      equipment_list TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_context_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection TEXT NOT NULL,
      document_id TEXT,
      operation TEXT NOT NULL,
      data TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 5,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      collection TEXT PRIMARY KEY,
      last_synced_at TEXT,
      version INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS exercises_cache (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      primary_muscles TEXT,
      secondary_muscles TEXT,
      equipment TEXT,
      instructions TEXT,
      tips TEXT,
      difficulty TEXT,
      alternatives TEXT,
      tags TEXT,
      image_url TEXT,
      gif_url TEXT,
      thumbnail_url TEXT,
      cached_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrate: add location_id to workout_sessions if missing
  const sessionCols = await database.getAllAsync("PRAGMA table_info(workout_sessions)");
  const sessionColNames = sessionCols.map(c => c.name);
  if (!sessionColNames.includes('location_id')) {
    await database.execAsync('ALTER TABLE workout_sessions ADD COLUMN location_id INTEGER');
  }
  if (!sessionColNames.includes('updated_at')) {
    await database.execAsync('ALTER TABLE workout_sessions ADD COLUMN updated_at TEXT');
  }
  if (!sessionColNames.includes('firestore_id')) {
    await database.execAsync('ALTER TABLE workout_sessions ADD COLUMN firestore_id TEXT');
  }

  // Migrate: add updated_at and firestore_id to workout_plans
  const planCols = await database.getAllAsync("PRAGMA table_info(workout_plans)");
  const planColNames = planCols.map(c => c.name);
  if (!planColNames.includes('updated_at')) {
    await database.execAsync('ALTER TABLE workout_plans ADD COLUMN updated_at TEXT');
  }
  if (!planColNames.includes('firestore_id')) {
    await database.execAsync('ALTER TABLE workout_plans ADD COLUMN firestore_id TEXT');
  }
  if (!planColNames.includes('active')) {
    await database.execAsync('ALTER TABLE workout_plans ADD COLUMN active INTEGER DEFAULT 1');
  }

  // Migrate: add updated_at and firestore_id to workout_sets
  const setCols = await database.getAllAsync("PRAGMA table_info(workout_sets)");
  const setColNames = setCols.map(c => c.name);
  if (!setColNames.includes('updated_at')) {
    await database.execAsync('ALTER TABLE workout_sets ADD COLUMN updated_at TEXT');
  }
  if (!setColNames.includes('firestore_id')) {
    await database.execAsync('ALTER TABLE workout_sets ADD COLUMN firestore_id TEXT');
  }

  // Migrate: add firestore_id to locations
  const locCols = await database.getAllAsync("PRAGMA table_info(locations)");
  const locColNames = locCols.map(c => c.name);
  if (!locColNames.includes('firestore_id')) {
    await database.execAsync('ALTER TABLE locations ADD COLUMN firestore_id TEXT');
  }
  if (!locColNames.includes('shared_location_id')) {
    await database.execAsync('ALTER TABLE locations ADD COLUMN shared_location_id TEXT');
  }

  // Active rest timer state (single-row table for app-kill recovery)
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS active_rest_timer (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      rest_end_time INTEGER NOT NULL,
      session_id INTEGER,
      exercise_name TEXT,
      set_number INTEGER,
      total_sets INTEGER,
      exercise_index INTEGER,
      total_exercises INTEGER,
      rest_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// --- Sync Queue Helpers ---

export async function queueSync(collection, documentId, operation, data) {
  const database = await getDatabase();
  const result = await database.runAsync(
    'INSERT INTO sync_queue (collection, document_id, operation, data) VALUES (?, ?, ?, ?)',
    [collection, documentId, operation, JSON.stringify(data)]
  );
  return result.lastInsertRowId;
}

export async function getPendingSync(limit = 50) {
  const database = await getDatabase();
  return await database.getAllAsync(
    "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
    [limit]
  );
}

export async function markSyncComplete(queueId) {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM sync_queue WHERE id = ?', [queueId]);
}

export async function markSyncFailed(queueId, error) {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE sync_queue
     SET retry_count = retry_count + 1,
         last_error = ?,
         status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'pending' END
     WHERE id = ?`,
    [error, queueId]
  );
}

export async function getSyncState(collection) {
  const database = await getDatabase();
  return await database.getFirstAsync(
    'SELECT * FROM sync_state WHERE collection = ?',
    [collection]
  );
}

export async function updateSyncState(collection, timestamp) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO sync_state (collection, last_synced_at, version)
     VALUES (?, ?, 1)
     ON CONFLICT(collection) DO UPDATE SET last_synced_at = excluded.last_synced_at, version = version + 1`,
    [collection, timestamp]
  );
}

export async function getFailedSyncCount() {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'"
  );
  return row?.count || 0;
}

// --- User Profile ---

export async function saveUserProfile(goal, equipment, experience, bodyStats = {}, schedule = {}, { syncToCloud = true } = {}) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    'INSERT INTO user_profile (goal, equipment, experience, age, weight_kg, gender, days_per_week, minutes_per_session, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [goal, equipment, experience, bodyStats.age || null, bodyStats.weight || null, bodyStats.gender || null, schedule.daysPerWeek || null, schedule.minutesPerSession || null, now]
  );
  if (syncToCloud) {
    const { pushToCloud } = require('./sync');
    pushToCloud('profile', null, {
      goal, equipment, experience,
      age: bodyStats.age || null,
      weight_kg: bodyStats.weight || null,
      gender: bodyStats.gender || null,
      days_per_week: schedule.daysPerWeek || null,
      minutes_per_session: schedule.minutesPerSession || null,
      updated_at: now,
    }, 'set');
  }
}

export async function getUserProfile() {
  const database = await getDatabase();
  return await database.getFirstAsync('SELECT * FROM user_profile ORDER BY id DESC LIMIT 1');
}

// --- Workout Plans ---

export async function saveWorkoutPlan(planJson, { syncToCloud = true } = {}) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  let firestoreId = null;

  if (syncToCloud) {
    const { generateFirestoreId } = require('./firestoreClient');
    const { getCurrentUid } = require('./sync');
    const uid = getCurrentUid();
    if (uid) {
      firestoreId = generateFirestoreId('plans', uid);
    }
  }

  // Deactivate previous plans
  await database.runAsync('UPDATE workout_plans SET active = 0 WHERE active = 1');

  await database.runAsync(
    'INSERT INTO workout_plans (plan_json, updated_at, firestore_id, active) VALUES (?, ?, ?, 1)',
    [JSON.stringify(planJson), now, firestoreId]
  );

  if (syncToCloud && firestoreId) {
    const { pushToCloud } = require('./sync');
    pushToCloud('plans', firestoreId, {
      plan_json: JSON.stringify(planJson),
      active: true,
      updated_at: now,
    }, 'set');
  }
}

export async function getLatestPlan() {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT * FROM workout_plans ORDER BY id DESC LIMIT 1');
  return row ? JSON.parse(row.plan_json) : null;
}

// --- Workout Sessions ---

export async function startSession(planDay, focus, locationId = null, { syncToCloud = true } = {}) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  let firestoreId = null;

  if (syncToCloud) {
    const { generateFirestoreId } = require('./firestoreClient');
    const { getCurrentUid } = require('./sync');
    const uid = getCurrentUid();
    if (uid) {
      firestoreId = generateFirestoreId('sessions', uid);
    }
  }

  const result = await database.runAsync(
    'INSERT INTO workout_sessions (plan_day, focus, location_id, updated_at, firestore_id) VALUES (?, ?, ?, ?, ?)',
    [planDay, focus, locationId, now, firestoreId]
  );

  if (syncToCloud && firestoreId) {
    const { pushToCloud } = require('./sync');
    pushToCloud('sessions', firestoreId, {
      plan_day: planDay,
      focus,
      location_id: locationId,
      started_at: now,
      updated_at: now,
    }, 'set');
  }

  return result.lastInsertRowId;
}

export async function endSession(sessionId, { syncToCloud = true } = {}) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE workout_sessions
     SET ended_at = datetime('now'),
         duration_seconds = CAST((julianday(datetime('now')) - julianday(started_at)) * 86400 AS INTEGER),
         updated_at = ?
     WHERE id = ?`,
    [now, sessionId]
  );

  if (syncToCloud) {
    const session = await database.getFirstAsync(
      'SELECT firestore_id, ended_at, duration_seconds FROM workout_sessions WHERE id = ?',
      [sessionId]
    );
    if (session?.firestore_id) {
      const { pushToCloud } = require('./sync');
      pushToCloud('sessions', session.firestore_id, {
        ended_at: session.ended_at,
        duration_seconds: session.duration_seconds,
        updated_at: now,
      }, 'update');
    }
  }
}

export async function getSessionStats(sessionId) {
  const database = await getDatabase();
  const setStats = await database.getFirstAsync(`
    SELECT
      COUNT(*) as total_sets,
      SUM(CASE WHEN weight_unit = 'lbs' THEN weight * 0.453592 ELSE weight END * reps) as total_volume,
      COUNT(DISTINCT exercise_name) as exercises_done
    FROM workout_sets WHERE session_id = ?
  `, [sessionId]);
  const session = await database.getFirstAsync(
    'SELECT duration_seconds FROM workout_sessions WHERE id = ?',
    [sessionId]
  );
  return { ...setStats, duration_seconds: session?.duration_seconds || 0 };
}

// --- Workout Sets ---

export async function logSet(sessionId, exerciseName, setNumber, weight, weightUnit, reps, rpe, restSeconds, { syncToCloud = true } = {}) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  let firestoreId = null;

  if (syncToCloud) {
    // Look up parent session's firestore_id for the Firestore path
    const session = await database.getFirstAsync(
      'SELECT firestore_id FROM workout_sessions WHERE id = ?',
      [sessionId]
    );
    if (session?.firestore_id) {
      const { generateFirestoreId } = require('./firestoreClient');
      const { getCurrentUid } = require('./sync');
      const uid = getCurrentUid();
      if (uid) {
        firestoreId = generateFirestoreId(`sessions/${session.firestore_id}/sets`, uid);
      }
    }
  }

  const result = await database.runAsync(
    `INSERT INTO workout_sets (session_id, exercise_name, set_number, weight, weight_unit, reps, rpe, rest_seconds, updated_at, firestore_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, exerciseName, setNumber, weight, weightUnit, reps, rpe, restSeconds, now, firestoreId]
  );

  if (syncToCloud && firestoreId) {
    const session = await database.getFirstAsync(
      'SELECT firestore_id FROM workout_sessions WHERE id = ?',
      [sessionId]
    );
    if (session?.firestore_id) {
      const { pushToCloud } = require('./sync');
      pushToCloud(`sessions/${session.firestore_id}/sets`, firestoreId, {
        exercise_name: exerciseName,
        set_number: setNumber,
        weight,
        weight_unit: weightUnit,
        reps,
        rpe,
        rest_seconds: restSeconds,
        logged_at: now,
        updated_at: now,
      }, 'set');
    }
  }

  return result.lastInsertRowId;
}

export async function getRecentSets(exerciseName, limit = 5) {
  const database = await getDatabase();
  return await database.getAllAsync(
    'SELECT * FROM workout_sets WHERE exercise_name = ? ORDER BY logged_at DESC LIMIT ?',
    [exerciseName, limit]
  );
}

// --- Exercise Unit Preferences ---

export async function getExerciseUnitPreference(exerciseName) {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    'SELECT weight_unit FROM exercise_unit_preferences WHERE exercise_name = ?',
    [exerciseName]
  );
  return row?.weight_unit || 'kg';
}

export async function setExerciseUnitPreference(exerciseName, unit, { syncToCloud = true } = {}) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO exercise_unit_preferences (exercise_name, weight_unit, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(exercise_name) DO UPDATE SET weight_unit = excluded.weight_unit, updated_at = excluded.updated_at`,
    [exerciseName, unit]
  );
  if (syncToCloud) {
    const { pushToCloud } = require('./sync');
    pushToCloud('preferences', 'exerciseUnits', {
      [exerciseName]: unit,
      updated_at: new Date().toISOString(),
    }, 'set');
  }
}

// --- Locations ---

export async function saveLocation(name, equipmentList, isDefault = false, { syncToCloud = true } = {}) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  let firestoreId = null;

  if (syncToCloud) {
    const { generateFirestoreId } = require('./firestoreClient');
    const { getCurrentUid } = require('./sync');
    const uid = getCurrentUid();
    if (uid) {
      firestoreId = generateFirestoreId('locations', uid);
    }
  }

  const result = await database.runAsync(
    'INSERT INTO locations (name, equipment_list, is_default, updated_at, firestore_id) VALUES (?, ?, ?, ?, ?)',
    [name, JSON.stringify(equipmentList), isDefault ? 1 : 0, now, firestoreId]
  );

  if (syncToCloud && firestoreId) {
    const { pushToCloud } = require('./sync');
    pushToCloud('locations', firestoreId, {
      name,
      equipment_list: JSON.stringify(equipmentList),
      is_default: isDefault ? 1 : 0,
      updated_at: now,
    }, 'set');
  }

  return result.lastInsertRowId;
}

export async function getLocations() {
  const database = await getDatabase();
  const rows = await database.getAllAsync('SELECT * FROM locations ORDER BY is_default DESC, name ASC');
  return rows.map(r => ({ ...r, equipment_list: JSON.parse(r.equipment_list) }));
}

export async function getLocation(id) {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT * FROM locations WHERE id = ?', [id]);
  return row ? { ...row, equipment_list: JSON.parse(row.equipment_list) } : null;
}

export async function updateLocation(id, name, equipmentList, { syncToCloud = true } = {}) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    "UPDATE locations SET name = ?, equipment_list = ?, updated_at = ? WHERE id = ?",
    [name, JSON.stringify(equipmentList), now, id]
  );

  if (syncToCloud) {
    const loc = await database.getFirstAsync('SELECT firestore_id FROM locations WHERE id = ?', [id]);
    if (loc?.firestore_id) {
      const { pushToCloud } = require('./sync');
      pushToCloud('locations', loc.firestore_id, {
        name,
        equipment_list: JSON.stringify(equipmentList),
        updated_at: now,
      }, 'update');
    }
  }
}

export async function deleteLocation(id, { syncToCloud = true } = {}) {
  const database = await getDatabase();

  let firestoreId = null;
  if (syncToCloud) {
    const loc = await database.getFirstAsync('SELECT firestore_id FROM locations WHERE id = ?', [id]);
    firestoreId = loc?.firestore_id;
  }

  await database.runAsync('DELETE FROM locations WHERE id = ?', [id]);

  if (syncToCloud && firestoreId) {
    const { pushToCloud } = require('./sync');
    pushToCloud('locations', firestoreId, {}, 'delete');
  }
}

export async function getDefaultLocation() {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT * FROM locations WHERE is_default = 1');
  return row ? { ...row, equipment_list: JSON.parse(row.equipment_list) } : null;
}

export async function setDefaultLocation(id, { syncToCloud = true } = {}) {
  const database = await getDatabase();
  const now = new Date().toISOString();

  // Get old and new default locations' firestore IDs before changing
  let oldDefaultFsId = null;
  let newDefaultFsId = null;
  if (syncToCloud) {
    const oldDefault = await database.getFirstAsync('SELECT firestore_id FROM locations WHERE is_default = 1');
    oldDefaultFsId = oldDefault?.firestore_id;
    const newDefault = await database.getFirstAsync('SELECT firestore_id FROM locations WHERE id = ?', [id]);
    newDefaultFsId = newDefault?.firestore_id;
  }

  await database.runAsync('UPDATE locations SET is_default = 0, updated_at = ?', [now]);
  await database.runAsync('UPDATE locations SET is_default = 1, updated_at = ? WHERE id = ?', [now, id]);

  if (syncToCloud) {
    const { pushToCloud } = require('./sync');
    if (oldDefaultFsId) {
      pushToCloud('locations', oldDefaultFsId, { is_default: false, updated_at: now }, 'update');
    }
    if (newDefaultFsId) {
      pushToCloud('locations', newDefaultFsId, { is_default: true, updated_at: now }, 'update');
    }
  }
}

// --- Shared Location Linking ---

export async function linkLocationToShared(localId, sharedLocationId) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    'UPDATE locations SET shared_location_id = ?, updated_at = ? WHERE id = ?',
    [sharedLocationId, now, localId]
  );
}

export async function getLocationBySharedId(sharedLocationId) {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    'SELECT * FROM locations WHERE shared_location_id = ?',
    [sharedLocationId]
  );
  return row ? { ...row, equipment_list: JSON.parse(row.equipment_list) } : null;
}

// --- Exercise Cache ---

export async function cacheExercises(exercises) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  for (const ex of exercises) {
    await database.runAsync(
      `INSERT OR REPLACE INTO exercises_cache
       (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, tips, difficulty, alternatives, tags, image_url, gif_url, thumbnail_url, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ex.id,
        ex.name,
        ex.category,
        JSON.stringify(ex.primaryMuscles || []),
        JSON.stringify(ex.secondaryMuscles || []),
        JSON.stringify(ex.equipment || []),
        JSON.stringify(ex.instructions || []),
        JSON.stringify(ex.tips || []),
        ex.difficulty || null,
        JSON.stringify(ex.alternatives || []),
        JSON.stringify(ex.tags || []),
        ex.imageUrl || null,
        ex.gifUrl || null,
        ex.thumbnailUrl || null,
        now,
      ]
    );
  }
}

export async function getCachedExercises({ category, equipment, difficulty, muscle, search } = {}) {
  const database = await getDatabase();
  let sql = 'SELECT * FROM exercises_cache WHERE 1=1';
  const params = [];

  if (category && category !== 'All') {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (difficulty) {
    sql += ' AND difficulty = ?';
    params.push(difficulty);
  }
  if (equipment) {
    sql += " AND equipment LIKE ?";
    params.push(`%"${equipment}"%`);
  }
  if (muscle) {
    sql += " AND primary_muscles LIKE ?";
    params.push(`%"${muscle}"%`);
  }
  if (search) {
    sql += ' AND LOWER(name) LIKE ?';
    params.push(`%${search.toLowerCase()}%`);
  }

  sql += ' ORDER BY name ASC';
  const rows = await database.getAllAsync(sql, params);
  return rows.map(parseExerciseRow);
}

export async function getCachedExerciseBySlug(slug) {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT * FROM exercises_cache WHERE id = ?', [slug]);
  return row ? parseExerciseRow(row) : null;
}

export async function getCachedExercisesByNames(names) {
  if (!names || names.length === 0) return [];
  const database = await getDatabase();
  const placeholders = names.map(() => '?').join(', ');
  const lowerNames = names.map(n => n.toLowerCase());
  const rows = await database.getAllAsync(
    `SELECT * FROM exercises_cache WHERE LOWER(name) IN (${placeholders})`,
    lowerNames
  );
  return rows.map(parseExerciseRow);
}

export async function getExerciseCacheAge() {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT MIN(cached_at) as oldest FROM exercises_cache');
  return row?.oldest || null;
}

export async function clearExerciseCache() {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM exercises_cache');
}

function parseExerciseRow(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    primaryMuscles: JSON.parse(row.primary_muscles || '[]'),
    secondaryMuscles: JSON.parse(row.secondary_muscles || '[]'),
    equipment: JSON.parse(row.equipment || '[]'),
    instructions: JSON.parse(row.instructions || '[]'),
    tips: JSON.parse(row.tips || '[]'),
    difficulty: row.difficulty,
    alternatives: JSON.parse(row.alternatives || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    imageUrl: row.image_url,
    gifUrl: row.gif_url,
    thumbnailUrl: row.thumbnail_url,
  };
}

// --- Agent Interactions (NOT synced) ---

export async function saveAgentInteraction(sessionId, userMessage, agentsUsed, latency) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO agent_interactions (session_id, user_message, agents_invoked, orchestrator_latency_ms, total_latency_ms)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, userMessage, JSON.stringify(agentsUsed), latency?.orchestrator || null, latency?.total || null]
  );
}

// --- Reset (dev use, NOT synced) ---

export async function resetDatabase() {
  const database = await getDatabase();
  await database.execAsync(`
    DELETE FROM workout_sets;
    DELETE FROM workout_sessions;
    DELETE FROM workout_plans;
    DELETE FROM user_profile;
    DELETE FROM sync_queue;
    DELETE FROM sync_state;
  `);
}

// --- Progress: Weekly Volume ---

export async function getWeeklyVolume(days = 7) {
  const database = await getDatabase();
  return await database.getAllAsync(`
    SELECT DATE(s.started_at) as date, COALESCE(SUM(CASE WHEN ws.weight_unit = 'lbs' THEN ws.weight * 0.453592 ELSE ws.weight END * ws.reps), 0) as volume
    FROM workout_sessions s
    LEFT JOIN workout_sets ws ON ws.session_id = s.id
    WHERE s.started_at >= datetime('now', '-' || ? || ' days')
    GROUP BY DATE(s.started_at)
    ORDER BY date ASC
  `, [days]);
}

// --- Progress: Strength Gains ---

export async function getStrengthGains(weeks = 4) {
  const database = await getDatabase();
  return await database.getAllAsync(`
    SELECT strftime('%Y-W%W', ws.logged_at) as week, MAX(CASE WHEN ws.weight_unit = 'lbs' THEN ws.weight * 0.453592 ELSE ws.weight END) as maxWeight
    FROM workout_sets ws
    WHERE ws.logged_at >= datetime('now', '-' || ? || ' days')
      AND ws.reps >= 1
      AND ws.weight > 0
    GROUP BY week
    ORDER BY week ASC
  `, [weeks * 7]);
}

// --- Progress: Workout Streak ---

export async function getWorkoutStreak() {
  const database = await getDatabase();
  const rows = await database.getAllAsync(`
    SELECT DISTINCT DATE(started_at) as date
    FROM workout_sessions
    WHERE ended_at IS NOT NULL
    ORDER BY date DESC
  `);

  if (rows.length === 0) return { current: 0, longest: 0 };

  let current = 0;
  let longest = 0;
  let streak = 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = rows.map(r => {
    const d = new Date(r.date + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const diffFromToday = Math.floor((today - dates[0]) / 86400000);
  if (diffFromToday > 1) {
    current = 0;
  } else {
    current = 1;
    for (let i = 1; i < dates.length; i++) {
      const gap = Math.floor((dates[i - 1] - dates[i]) / 86400000);
      if (gap <= 1) {
        current++;
      } else {
        break;
      }
    }
  }

  streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const gap = Math.floor((dates[i - 1] - dates[i]) / 86400000);
    if (gap <= 1) {
      streak++;
    } else {
      longest = Math.max(longest, streak);
      streak = 1;
    }
  }
  longest = Math.max(longest, streak, current);

  return { current, longest };
}

// --- Progress: Consistency Heatmap ---

export async function getConsistencyHeatmap(weeks = 4) {
  const database = await getDatabase();
  const days = weeks * 7;
  const results = [];

  const rows = await database.getAllAsync(`
    SELECT DATE(ws.logged_at) as date, COUNT(*) as sets_count
    FROM workout_sets ws
    WHERE ws.logged_at >= datetime('now', '-' || ? || ' days')
    GROUP BY DATE(ws.logged_at)
  `, [days]);

  const countMap = {};
  rows.forEach(r => { countMap[r.date] = r.sets_count; });

  const maxSets = Math.max(...rows.map(r => r.sets_count), 1);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const count = countMap[dateStr] || 0;
    results.push({
      date: dateStr,
      intensity: count > 0 ? Math.max(0.2, count / maxSets) : 0,
    });
  }

  return results;
}

// --- Progress: Personal Records ---

export async function getPersonalRecords() {
  const database = await getDatabase();
  return await database.getAllAsync(`
    WITH best AS (
      SELECT
        LOWER(exercise_name) as exercise_key,
        exercise_name,
        MAX(CASE WHEN weight_unit = 'lbs' THEN weight * 0.453592 ELSE weight END) as pr_weight,
        MAX(CASE WHEN (CASE WHEN weight_unit = 'lbs' THEN weight * 0.453592 ELSE weight END) = (SELECT MAX(CASE WHEN w2.weight_unit = 'lbs' THEN w2.weight * 0.453592 ELSE w2.weight END) FROM workout_sets w2 WHERE LOWER(w2.exercise_name) = LOWER(ws.exercise_name) AND w2.reps >= 1) THEN ws.logged_at END) as pr_date
      FROM workout_sets ws
      WHERE ws.reps >= 1 AND ws.weight > 0
      GROUP BY LOWER(exercise_name)
    ),
    second_best AS (
      SELECT
        LOWER(exercise_name) as exercise_key,
        MAX(CASE WHEN weight_unit = 'lbs' THEN weight * 0.453592 ELSE weight END) as previous_best
      FROM workout_sets ws2
      WHERE reps >= 1 AND weight > 0
        AND (CASE WHEN weight_unit = 'lbs' THEN weight * 0.453592 ELSE weight END) < (
          SELECT MAX(CASE WHEN w3.weight_unit = 'lbs' THEN w3.weight * 0.453592 ELSE w3.weight END)
          FROM workout_sets w3
          WHERE LOWER(w3.exercise_name) = LOWER(ws2.exercise_name) AND w3.reps >= 1 AND w3.weight > 0
        )
      GROUP BY LOWER(exercise_name)
    )
    SELECT
      b.exercise_name,
      b.pr_weight,
      b.pr_date,
      COALESCE(sb.previous_best, b.pr_weight) as previous_best,
      CASE WHEN sb.previous_best IS NOT NULL AND sb.previous_best > 0
        THEN ROUND((b.pr_weight - sb.previous_best) * 100.0 / sb.previous_best, 1)
        ELSE 0
      END as improvement_pct
    FROM best b
    LEFT JOIN second_best sb ON b.exercise_key = sb.exercise_key
    ORDER BY b.pr_weight DESC
  `);
}

// --- Progress: Combined Summary ---

export async function getProgressSummary() {
  const [weeklyVolume, strengthGains, streak, heatmap, personalRecords] = await Promise.all([
    getWeeklyVolume(),
    getStrengthGains(),
    getWorkoutStreak(),
    getConsistencyHeatmap(),
    getPersonalRecords(),
  ]);
  return { weeklyVolume, strengthGains, streak, heatmap, personalRecords };
}

// --- Check onboarding ---

export async function hasCompletedOnboarding() {
  const database = await getDatabase();
  const profile = await database.getFirstAsync('SELECT id FROM user_profile LIMIT 1');
  return !!profile;
}

// --- Progressive Overload ---

function isLowerBodyExercise(exerciseName) {
  const lower = (exerciseName || '').toLowerCase();
  const lowerKeywords = [
    'squat', 'deadlift', 'rdl', 'lunge', 'leg press', 'leg curl',
    'leg extension', 'hip thrust', 'calf', 'glute', 'hamstring',
    'step up', 'step-up', 'goblet', 'hack squat', 'bulgarian',
  ];
  return lowerKeywords.some(kw => lower.includes(kw));
}

export async function getExerciseProgressionData(exerciseName, weeks = 4, preferredUnit = 'kg') {
  const database = await getDatabase();
  const days = weeks * 7;

  const profile = await database.getFirstAsync('SELECT goal FROM user_profile ORDER BY id DESC LIMIT 1');
  const goal = (profile?.goal || '').toLowerCase();

  const rows = await database.getAllAsync(`
    SELECT
      CASE WHEN ws.weight_unit = 'lbs' THEN ws.weight * 0.453592 ELSE ws.weight END as weight,
      ws.reps, ws.rpe, ws.logged_at
    FROM workout_sets ws
    WHERE LOWER(ws.exercise_name) = LOWER(?)
      AND ws.logged_at >= datetime('now', '-' || ? || ' days')
      AND ws.weight > 0
    ORDER BY ws.logged_at DESC
  `, [exerciseName, days]);

  if (rows.length === 0) {
    return { weights: [], rpes: [], isPlateaued: false, suggestedWeight: null, pushReason: null };
  }

  const weights = rows.map(r => r.weight);
  const rpes = rows.filter(r => r.rpe != null).map(r => r.rpe);
  const currentMax = Math.max(...weights);
  const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  const isLower = isLowerBodyExercise(exerciseName);

  const recentWeights = weights.slice(0, 6).map(w => Math.round(w * 2) / 2);
  const isPlateaued = recentWeights.length >= 6 && new Set(recentWeights).size === 1;

  const recentRpes = rpes.slice(0, 3);
  const olderRpes = rpes.slice(3, 6);
  const recentAvgRpe = recentRpes.length > 0 ? recentRpes.reduce((a, b) => a + b, 0) / recentRpes.length : null;
  const olderAvgRpe = olderRpes.length > 0 ? olderRpes.reduce((a, b) => a + b, 0) / olderRpes.length : null;
  const rpeTrend = (recentAvgRpe !== null && olderAvgRpe !== null) ? recentAvgRpe - olderAvgRpe : null;

  let pushThreshold, deloadThreshold, incrementKg;
  if (goal.includes('strength')) {
    pushThreshold = 8;
    deloadThreshold = 9.5;
    incrementKg = isLower ? 5 : 2.5;
  } else if (goal.includes('fat') || goal.includes('lose')) {
    pushThreshold = 6;
    deloadThreshold = 8.5;
    incrementKg = isLower ? 2.5 : 1;
  } else {
    pushThreshold = 7;
    deloadThreshold = 9;
    incrementKg = isLower ? 5 : 2.5;
  }

  let suggestedWeightKg = null;
  let pushReason = null;

  if (avgRpe !== null) {
    if (avgRpe < pushThreshold) {
      suggestedWeightKg = currentMax + incrementKg;
      const rpeStr = avgRpe.toFixed(1);
      const displayIncrement = preferredUnit === 'lbs' ? Math.round(incrementKg * 2.20462) : incrementKg;
      const unitLabel = preferredUnit;
      if (rpeTrend !== null && rpeTrend < -0.5) {
        pushReason = `RPE trending down (${rpeStr}) — sets are getting easier. Time to push.`;
      } else {
        pushReason = `Avg RPE ${rpeStr} is below your ${goal.includes('strength') ? 'strength' : 'growth'} threshold. You're ready for +${displayIncrement}${unitLabel}.`;
      }
    } else if (avgRpe > deloadThreshold) {
      suggestedWeightKg = Math.round(currentMax * 0.95 * 2) / 2;
      pushReason = `Avg RPE ${avgRpe.toFixed(1)} is very high — backing off 5% for recovery.`;
    } else {
      suggestedWeightKg = currentMax;
    }

    if (isPlateaued && avgRpe <= pushThreshold + 1 && suggestedWeightKg <= currentMax) {
      suggestedWeightKg = currentMax + incrementKg;
      const displayIncrement = preferredUnit === 'lbs' ? Math.round(incrementKg * 2.20462) : incrementKg;
      const unitLabel = preferredUnit;
      pushReason = `Same weight for ${recentWeights.length}+ sets with manageable RPE — break the plateau with +${displayIncrement}${unitLabel}.`;
    }
  }

  let suggestedWeight = suggestedWeightKg;
  if (suggestedWeightKg !== null && preferredUnit === 'lbs') {
    suggestedWeight = Math.round(suggestedWeightKg * 2.20462);
  }

  return { weights, rpes, isPlateaued, suggestedWeight, pushReason, avgRpe: avgRpe, rpeTrend };
}

// --- Programmer: Recent workout history ---

export async function getRecentWorkoutHistory(days = 30) {
  const database = await getDatabase();
  return await database.getAllAsync(`
    SELECT
      s.id as session_id,
      s.plan_day,
      s.focus,
      s.started_at,
      s.duration_seconds,
      ws.exercise_name,
      ws.set_number,
      ws.weight,
      ws.weight_unit,
      ws.reps,
      ws.rpe,
      ws.rest_seconds
    FROM workout_sessions s
    JOIN workout_sets ws ON ws.session_id = s.id
    WHERE s.started_at >= datetime('now', '-' || ? || ' days')
    ORDER BY s.started_at DESC, ws.set_number ASC
  `, [days]);
}

// --- Max weight for exercise ---

export async function getExerciseMaxWeight(exerciseName) {
  const database = await getDatabase();
  const row = await database.getFirstAsync(`
    SELECT MAX(CASE WHEN weight_unit = 'lbs' THEN weight * 0.453592 ELSE weight END) as max_weight
    FROM workout_sets
    WHERE LOWER(exercise_name) = LOWER(?)
      AND weight > 0
      AND reps >= 1
  `, [exerciseName]);
  return row?.max_weight || null;
}

// --- Greeting data ---

export async function getGreetingData() {
  const database = await getDatabase();
  const [streak, sessionCount, latestSession] = await Promise.all([
    getWorkoutStreak(),
    getCompletedSessionCount(),
    database.getFirstAsync('SELECT plan_day, focus, started_at FROM workout_sessions ORDER BY started_at DESC LIMIT 1'),
  ]);
  return {
    streak,
    sessionCount,
    lastWorkoutFocus: latestSession?.focus || null,
    lastWorkoutDate: latestSession?.started_at || null,
  };
}

// --- Recent progress summary for greeting context ---

export async function getRecentProgressSummary() {
  const database = await getDatabase();

  // Volume trend: total volume (weight * reps) last 3 sessions vs prior 3
  const recentVolume = await database.getFirstAsync(`
    SELECT COALESCE(SUM(CASE WHEN s.weight_unit = 'lbs' THEN s.weight * 0.453592 ELSE s.weight END * s.reps), 0) as volume
    FROM workout_sets s
    JOIN workout_sessions ws ON s.session_id = ws.id
    WHERE ws.ended_at IS NOT NULL
    AND ws.id IN (SELECT id FROM workout_sessions WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT 3)
  `);
  const priorVolume = await database.getFirstAsync(`
    SELECT COALESCE(SUM(CASE WHEN s.weight_unit = 'lbs' THEN s.weight * 0.453592 ELSE s.weight END * s.reps), 0) as volume
    FROM workout_sets s
    JOIN workout_sessions ws ON s.session_id = ws.id
    WHERE ws.ended_at IS NOT NULL
    AND ws.id IN (SELECT id FROM workout_sessions WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT 3 OFFSET 3)
  `);

  // Personal records in last 7 days: exercises where max weight exceeded all-time prior best
  const recentPRs = await database.getAllAsync(`
    SELECT s.exercise_name, MAX(s.weight) as max_weight, s.weight_unit
    FROM workout_sets s
    JOIN workout_sessions ws ON s.session_id = ws.id
    WHERE ws.ended_at IS NOT NULL
      AND ws.started_at >= datetime('now', '-7 days')
      AND s.weight > 0
    GROUP BY s.exercise_name
    HAVING MAX(s.weight) > (
      SELECT COALESCE(MAX(s2.weight), 0)
      FROM workout_sets s2
      JOIN workout_sessions ws2 ON s2.session_id = ws2.id
      WHERE ws2.ended_at IS NOT NULL
        AND ws2.started_at < datetime('now', '-7 days')
        AND s2.exercise_name = s.exercise_name
    )
  `);

  const volumeTrend = priorVolume?.volume > 0
    ? Math.round(((recentVolume?.volume - priorVolume?.volume) / priorVolume?.volume) * 100)
    : null;

  return {
    volumeTrend,
    recentPRs: recentPRs || [],
  };
}

// --- Completed session count ---

export async function getCompletedSessionCount(sinceDays = null) {
  const database = await getDatabase();
  const q = sinceDays
    ? `SELECT COUNT(*) as count FROM workout_sessions WHERE ended_at IS NOT NULL AND started_at >= datetime('now', '-' || ? || ' days')`
    : 'SELECT COUNT(*) as count FROM workout_sessions WHERE ended_at IS NOT NULL';
  const params = sinceDays ? [sinceDays] : [];
  const row = await database.getFirstAsync(q, params);
  return row?.count || 0;
}

// --- Active Rest Timer (app-kill recovery) ---

export async function saveRestTimer(restEndTime, sessionId, exerciseName, setNumber, totalSets, exerciseIndex, totalExercises, restId) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO active_rest_timer (id, rest_end_time, session_id, exercise_name, set_number, total_sets, exercise_index, total_exercises, rest_id)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [restEndTime, sessionId, exerciseName, setNumber, totalSets, exerciseIndex, totalExercises, restId]
  );
}

export async function getActiveRestTimer() {
  const database = await getDatabase();
  return await database.getFirstAsync('SELECT * FROM active_rest_timer WHERE id = 1');
}

export async function clearRestTimer() {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM active_rest_timer WHERE id = 1');
}

// --- Training context for AI history awareness ---

export async function getTrainingContext(days = 7) {
  const database = await getDatabase();

  // Get recent sessions with their exercises and muscle groups
  const rows = await database.getAllAsync(`
    SELECT
      s.id as session_id,
      s.plan_day,
      s.focus,
      DATE(s.started_at) as session_date,
      s.started_at,
      ws.exercise_name,
      ws.weight,
      ws.weight_unit,
      ws.reps,
      ws.rpe,
      ws.set_number,
      ec.primary_muscles,
      ec.secondary_muscles
    FROM workout_sessions s
    JOIN workout_sets ws ON ws.session_id = s.id
    LEFT JOIN exercises_cache ec ON LOWER(ec.name) = LOWER(ws.exercise_name)
    WHERE s.started_at >= datetime('now', '-' || ? || ' days')
      AND s.ended_at IS NOT NULL
    ORDER BY s.started_at DESC, ws.set_number ASC
  `, [days]);

  if (!rows || rows.length === 0) return null;

  // Group by session date → build per-day summaries
  const sessionsByDate = {};
  const muscleGroupDays = {}; // muscle group → most recent date trained
  const exerciseHistory = {}; // exercise → { lastDate, lastWeight, lastReps, avgRpe, setCount }

  for (const row of rows) {
    const date = row.session_date;

    if (!sessionsByDate[date]) {
      sessionsByDate[date] = {
        date,
        focus: row.focus || 'General',
        isPlanned: row.plan_day != null,
        exercises: new Set(),
        muscleGroups: new Set(),
      };
    }

    sessionsByDate[date].exercises.add(row.exercise_name);

    // Parse muscle groups from exercises_cache (try/catch per row so one bad entry doesn't kill the batch)
    let primaryMuscles = [];
    let secondaryMuscles = [];
    try { primaryMuscles = row.primary_muscles ? JSON.parse(row.primary_muscles) : []; } catch {}
    try { secondaryMuscles = row.secondary_muscles ? JSON.parse(row.secondary_muscles) : []; } catch {}

    for (const muscle of primaryMuscles) {
      sessionsByDate[date].muscleGroups.add(muscle);
      if (!muscleGroupDays[muscle] || date > muscleGroupDays[muscle]) {
        muscleGroupDays[muscle] = date;
      }
    }
    for (const muscle of secondaryMuscles) {
      sessionsByDate[date].muscleGroups.add(muscle);
      if (!muscleGroupDays[muscle] || date > muscleGroupDays[muscle]) {
        muscleGroupDays[muscle] = date;
      }
    }

    // Track per-exercise history (use heaviest set for weight estimation)
    const exName = row.exercise_name;
    if (!exerciseHistory[exName]) {
      exerciseHistory[exName] = { lastDate: date, lastWeight: row.weight, lastUnit: row.weight_unit, lastReps: row.reps, rpeSum: 0, rpeCount: 0, setCount: 0 };
    } else if (row.weight > exerciseHistory[exName].lastWeight) {
      exerciseHistory[exName].lastWeight = row.weight;
      exerciseHistory[exName].lastUnit = row.weight_unit;
      exerciseHistory[exName].lastReps = row.reps;
    }
    exerciseHistory[exName].setCount++;
    if (row.rpe) {
      exerciseHistory[exName].rpeSum += row.rpe;
      exerciseHistory[exName].rpeCount++;
    }
  }

  // Build compact summaries
  const recentSessions = Object.values(sessionsByDate).map(s => ({
    date: s.date,
    focus: s.focus,
    isPlanned: s.isPlanned,
    exercises: Array.from(s.exercises),
    muscleGroups: Array.from(s.muscleGroups),
  }));

  // Build exercise weight map for smart weight estimation
  const exerciseWeights = {};
  for (const [name, data] of Object.entries(exerciseHistory)) {
    exerciseWeights[name] = {
      lastWeight: data.lastWeight,
      lastUnit: data.lastUnit,
      lastReps: data.lastReps,
      avgRpe: data.rpeCount > 0 ? Math.round((data.rpeSum / data.rpeCount) * 10) / 10 : null,
    };
  }

  return {
    recentSessions,
    muscleGroupLastTrained: muscleGroupDays,
    exerciseWeights,
  };
}
