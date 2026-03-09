import * as SQLite from 'expo-sqlite';

let db = null;

export async function getDatabase() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('aura.db');
  await initializeDatabase(db);
  return db;
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
  `);
}

// User Profile
export async function saveUserProfile(goal, equipment, experience, bodyStats = {}, schedule = {}) {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO user_profile (goal, equipment, experience, age, weight_kg, gender, days_per_week, minutes_per_session) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [goal, equipment, experience, bodyStats.age || null, bodyStats.weight || null, bodyStats.gender || null, schedule.daysPerWeek || null, schedule.minutesPerSession || null]
  );
}

export async function getUserProfile() {
  const database = await getDatabase();
  return await database.getFirstAsync('SELECT * FROM user_profile ORDER BY id DESC LIMIT 1');
}

// Workout Plans
export async function saveWorkoutPlan(planJson) {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO workout_plans (plan_json) VALUES (?)',
    [JSON.stringify(planJson)]
  );
}

export async function getLatestPlan() {
  const database = await getDatabase();
  const row = await database.getFirstAsync('SELECT * FROM workout_plans ORDER BY id DESC LIMIT 1');
  return row ? JSON.parse(row.plan_json) : null;
}

// Workout Sessions
export async function startSession(planDay, focus) {
  const database = await getDatabase();
  const result = await database.runAsync(
    'INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)',
    [planDay, focus]
  );
  return result.lastInsertRowId;
}

export async function endSession(sessionId) {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE workout_sessions
     SET ended_at = datetime('now'),
         duration_seconds = CAST((julianday(datetime('now')) - julianday(started_at)) * 86400 AS INTEGER)
     WHERE id = ?`,
    [sessionId]
  );
}

export async function getSessionStats(sessionId) {
  const database = await getDatabase();
  return await database.getFirstAsync(`
    SELECT
      COUNT(*) as total_sets,
      SUM(weight * reps) as total_volume,
      COUNT(DISTINCT exercise_name) as exercises_done
    FROM workout_sets WHERE session_id = ?
  `, [sessionId]);
}

// Workout Sets
export async function logSet(sessionId, exerciseName, setNumber, weight, weightUnit, reps, rpe, restSeconds) {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO workout_sets (session_id, exercise_name, set_number, weight, weight_unit, reps, rpe, rest_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, exerciseName, setNumber, weight, weightUnit, reps, rpe, restSeconds]
  );
  return result.lastInsertRowId;
}

export async function getRecentSets(exerciseName, limit = 5) {
  const database = await getDatabase();
  return await database.getAllAsync(
    'SELECT * FROM workout_sets WHERE exercise_name = ? ORDER BY logged_at DESC LIMIT ?',
    [exerciseName, limit]
  );
}

// Reset all data (dev use)
export async function resetDatabase() {
  const database = await getDatabase();
  await database.execAsync(`
    DELETE FROM workout_sets;
    DELETE FROM workout_sessions;
    DELETE FROM workout_plans;
    DELETE FROM user_profile;
  `);
}

// Progress: Weekly Volume
export async function getWeeklyVolume(days = 7) {
  const database = await getDatabase();
  return await database.getAllAsync(`
    SELECT DATE(s.started_at) as date, COALESCE(SUM(ws.weight * ws.reps), 0) as volume
    FROM workout_sessions s
    LEFT JOIN workout_sets ws ON ws.session_id = s.id
    WHERE s.started_at >= datetime('now', '-' || ? || ' days')
    GROUP BY DATE(s.started_at)
    ORDER BY date ASC
  `, [days]);
}

// Progress: Strength Gains (max weight per week)
export async function getStrengthGains(weeks = 4) {
  const database = await getDatabase();
  return await database.getAllAsync(`
    SELECT strftime('%Y-W%W', ws.logged_at) as week, MAX(ws.weight) as maxWeight
    FROM workout_sets ws
    WHERE ws.logged_at >= datetime('now', '-' || ? || ' days')
      AND ws.reps >= 1
      AND ws.weight > 0
    GROUP BY week
    ORDER BY week ASC
  `, [weeks * 7]);
}

// Progress: Workout Streak
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

  // Check if most recent workout is today or yesterday
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

  // Calculate longest streak
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

// Progress: Consistency Heatmap
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

// Progress: Personal Records
export async function getPersonalRecords() {
  const database = await getDatabase();
  return await database.getAllAsync(`
    WITH best AS (
      SELECT
        LOWER(exercise_name) as exercise_key,
        exercise_name,
        MAX(weight) as pr_weight,
        MAX(CASE WHEN weight = (SELECT MAX(w2.weight) FROM workout_sets w2 WHERE LOWER(w2.exercise_name) = LOWER(ws.exercise_name) AND w2.reps >= 1) THEN ws.logged_at END) as pr_date
      FROM workout_sets ws
      WHERE ws.reps >= 1 AND ws.weight > 0
      GROUP BY LOWER(exercise_name)
    ),
    second_best AS (
      SELECT
        LOWER(exercise_name) as exercise_key,
        MAX(weight) as previous_best
      FROM workout_sets
      WHERE reps >= 1 AND weight > 0
      GROUP BY LOWER(exercise_name)
      HAVING COUNT(DISTINCT weight) > 1
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

// Progress: Combined Summary
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

// Check if user has completed onboarding
export async function hasCompletedOnboarding() {
  const database = await getDatabase();
  const profile = await database.getFirstAsync('SELECT id FROM user_profile LIMIT 1');
  return !!profile;
}

// Determine if exercise is upper or lower body for progression increments
function isLowerBodyExercise(exerciseName) {
  const lower = (exerciseName || '').toLowerCase();
  const lowerKeywords = [
    'squat', 'deadlift', 'rdl', 'lunge', 'leg press', 'leg curl',
    'leg extension', 'hip thrust', 'calf', 'glute', 'hamstring',
    'step up', 'step-up', 'goblet', 'hack squat', 'bulgarian',
  ];
  return lowerKeywords.some(kw => lower.includes(kw));
}

// Progressive Overload: Get exercise progression data (goal-aware)
export async function getExerciseProgressionData(exerciseName, weeks = 4) {
  const database = await getDatabase();
  const days = weeks * 7;

  // Fetch user goal for goal-aware progression
  const profile = await database.getFirstAsync('SELECT goal FROM user_profile ORDER BY id DESC LIMIT 1');
  const goal = (profile?.goal || '').toLowerCase();

  const rows = await database.getAllAsync(`
    SELECT ws.weight, ws.reps, ws.rpe, ws.logged_at
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

  // Plateau: no weight increase in last 6+ sets
  const recentWeights = weights.slice(0, 6);
  const isPlateaued = recentWeights.length >= 6 && new Set(recentWeights).size === 1;

  // RPE trend: compare last 3 sets vs previous 3 sets
  const recentRpes = rpes.slice(0, 3);
  const olderRpes = rpes.slice(3, 6);
  const recentAvgRpe = recentRpes.length > 0 ? recentRpes.reduce((a, b) => a + b, 0) / recentRpes.length : null;
  const olderAvgRpe = olderRpes.length > 0 ? olderRpes.reduce((a, b) => a + b, 0) / olderRpes.length : null;
  const rpeTrend = (recentAvgRpe !== null && olderAvgRpe !== null) ? recentAvgRpe - olderAvgRpe : null;

  // Goal-aware progression thresholds
  let pushThreshold, deloadThreshold, increment;
  if (goal.includes('strength')) {
    // Strength: push when RPE < 8, deload at 9.5+, larger increments
    pushThreshold = 8;
    deloadThreshold = 9.5;
    increment = isLower ? 5 : 2.5;
  } else if (goal.includes('fat') || goal.includes('lose')) {
    // Fat loss: push when RPE < 6, deload at 8.5+, smaller increments (maintain, don't chase PRs)
    pushThreshold = 6;
    deloadThreshold = 8.5;
    increment = isLower ? 2.5 : 1;
  } else {
    // Hypertrophy (Build Muscle): push when RPE < 7, deload at 9+
    pushThreshold = 7;
    deloadThreshold = 9;
    increment = isLower ? 5 : 2.5;
  }

  // Progressive overload logic with push reason
  let suggestedWeight = null;
  let pushReason = null;

  if (avgRpe !== null) {
    if (avgRpe < pushThreshold) {
      suggestedWeight = currentMax + increment;
      const rpeStr = avgRpe.toFixed(1);
      if (rpeTrend !== null && rpeTrend < -0.5) {
        pushReason = `RPE trending down (${rpeStr}) — sets are getting easier. Time to push.`;
      } else {
        pushReason = `Avg RPE ${rpeStr} is below your ${goal.includes('strength') ? 'strength' : 'growth'} threshold. You're ready for +${increment}kg.`;
      }
    } else if (avgRpe > deloadThreshold) {
      suggestedWeight = Math.round(currentMax * 0.95 * 2) / 2;
      pushReason = `Avg RPE ${avgRpe.toFixed(1)} is very high — backing off 5% for recovery.`;
    } else {
      suggestedWeight = currentMax;
    }

    // Plateau override: if plateaued and RPE is manageable, suggest a small push
    if (isPlateaued && avgRpe <= pushThreshold + 1 && suggestedWeight <= currentMax) {
      suggestedWeight = currentMax + increment;
      pushReason = `Same weight for ${recentWeights.length}+ sets with manageable RPE — break the plateau with +${increment}kg.`;
    }
  }

  return { weights, rpes, isPlateaued, suggestedWeight, pushReason, avgRpe: avgRpe, rpeTrend };
}

// Programmer: Get recent workout history for plan regeneration
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

// Count completed sessions since a given date
export async function getCompletedSessionCount(sinceDays = null) {
  const database = await getDatabase();
  const query = sinceDays
    ? `SELECT COUNT(*) as count FROM workout_sessions WHERE ended_at IS NOT NULL AND started_at >= datetime('now', '-' || ? || ' days')`
    : 'SELECT COUNT(*) as count FROM workout_sessions WHERE ended_at IS NOT NULL';
  const params = sinceDays ? [sinceDays] : [];
  const row = await database.getFirstAsync(query, params);
  return row?.count || 0;
}
