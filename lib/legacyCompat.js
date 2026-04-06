/**
 * legacyCompat.js
 *
 * One-way read-time shim bridging the legacy strength-only data model
 * (workout_sets + hardcoded goal enum) to the new block-based model.
 *
 * NOT a migrator — we never write to legacy tables through this module.
 * Analytics code (getTrainingContext) calls into this so that a mixed DB
 * (legacy sets + new block entries) produces a single unified view.
 *
 * Retain for >= 2 app versions per PRD §3 (Migration & Database Rules).
 */

// Legacy goal enum → canonical taxonomy objects.
// The new taxonomy is goal-agnostic and multi-dimensional. See PRD §4
// "Goal Elicitation Agent" — this is the deterministic mapping for users
// who onboarded before the conversational flow existed.
const LEGACY_GOAL_MAP = Object.freeze({
  build_muscle: {
    primary: 'hypertrophy',
    modalities: ['strength'],
    style: 'moderate_volume',
    source: 'legacy_enum',
  },
  lose_fat: {
    primary: 'body_composition',
    modalities: ['strength', 'conditioning'],
    style: 'mixed_modality',
    source: 'legacy_enum',
  },
  increase_strength: {
    primary: 'strength',
    modalities: ['strength'],
    style: 'low_rep_high_load',
    source: 'legacy_enum',
  },
});

/**
 * Map a legacy goal string (or array) into the canonical taxonomy object(s).
 * Unknown values pass through untouched so new-taxonomy values survive.
 *
 * @param {string|string[]|object|null|undefined} legacyGoal
 * @returns {object|object[]|null}
 */
export function mapLegacyGoal(legacyGoal) {
  if (legacyGoal == null) return null;
  if (Array.isArray(legacyGoal)) {
    return legacyGoal.map(mapLegacyGoal).filter(Boolean);
  }
  if (typeof legacyGoal === 'object') {
    // Already a taxonomy object — pass through.
    return legacyGoal;
  }
  if (typeof legacyGoal === 'string') {
    return LEGACY_GOAL_MAP[legacyGoal] || { primary: legacyGoal, modalities: [], style: null, source: 'unknown' };
  }
  return null;
}

/**
 * Project a legacy workout_sets row into a synthetic block_entries-shaped
 * record so analytics can treat legacy + block data uniformly.
 *
 * @param {object} row - a row from workout_sets
 * @returns {object} synthetic block_entries row
 */
export function workoutSetToBlockEntry(row) {
  return {
    // No real block id — analytics can scope by synthetic_block_id if needed.
    synthetic_block_id: `legacy:${row.session_id}:${row.exercise_name}`,
    entry_index: row.set_number,
    entry_type: 'strength_set',
    payload: {
      exercise: row.exercise_name,
      weight: row.weight,
      weight_unit: row.weight_unit || 'kg',
      reps: row.reps,
      rpe: row.rpe,
      rest_seconds: row.rest_seconds,
    },
    logged_at: row.logged_at,
    source: 'legacy_workout_sets',
  };
}

/**
 * Project the set of legacy rows for a single session into a synthetic
 * session_blocks shape. Each unique exercise becomes one strength block.
 *
 * @param {number|string} sessionId
 * @param {object[]} workoutSetRows - rows from workout_sets for this session
 * @returns {object[]} synthetic session_blocks-shaped objects
 */
export function workoutSetsToBlocks(sessionId, workoutSetRows) {
  if (!Array.isArray(workoutSetRows) || workoutSetRows.length === 0) return [];
  const byExercise = new Map();
  for (const row of workoutSetRows) {
    const key = row.exercise_name;
    if (!byExercise.has(key)) byExercise.set(key, []);
    byExercise.get(key).push(row);
  }
  const blocks = [];
  let idx = 0;
  for (const [exercise, rows] of byExercise.entries()) {
    blocks.push({
      synthetic_block_id: `legacy:${sessionId}:${exercise}`,
      session_id: sessionId,
      block_index: idx++,
      block_type: 'strength',
      label: exercise,
      config: {
        exercise,
        target_sets: rows.length,
      },
      entries: rows
        .sort((a, b) => (a.set_number || 0) - (b.set_number || 0))
        .map(workoutSetToBlockEntry),
      source: 'legacy_workout_sets',
    });
  }
  return blocks;
}

export const __legacyGoalMapForTests = LEGACY_GOAL_MAP;

export default {
  mapLegacyGoal,
  workoutSetToBlockEntry,
  workoutSetsToBlocks,
};
