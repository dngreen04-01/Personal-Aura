/**
 * getTrainingContext.test.js — pins analytics output across the migration.
 *
 * Phase 0 promise: legacy strength workouts continue to flow through
 * getTrainingContext() unchanged even after session_blocks / block_entries
 * tables are created alongside. Also exercises the legacyCompat read shim.
 */
const { getDatabase, closeDatabase, getTrainingContext } = require('../../lib/database');
const { workoutSetsToBlocks, mapLegacyGoal } = require('../../lib/legacyCompat');

function uid() { return `tc_${Math.random().toString(36).slice(2)}`; }

async function seedLegacySession(db, { exercises = [['Bench', [60,62.5,65]], ['Squat', [100,100,105]]], daysAgo = 1 } = {}) {
  const sess = await db.runAsync(
    `INSERT INTO workout_sessions (plan_day, focus, started_at, ended_at, duration_seconds)
     VALUES (?, ?, datetime('now','-' || ? || ' days'), datetime('now','-' || ? || ' days','+1 hour'), 3600)`,
    [1, 'upper', daysAgo, daysAgo]
  );
  for (const [name, weights] of exercises) {
    for (let i = 0; i < weights.length; i++) {
      await db.runAsync(
        `INSERT INTO workout_sets (session_id, exercise_name, set_number, weight, weight_unit, reps, logged_at)
         VALUES (?, ?, ?, ?, 'kg', 8, datetime('now','-' || ? || ' days'))`,
        [sess.lastInsertRowId, name, i + 1, weights[i], daysAgo]
      );
    }
  }
  return sess.lastInsertRowId;
}

describe('getTrainingContext + legacyCompat', () => {
  afterEach(async () => { await closeDatabase(); });

  it('returns null when no completed sessions exist', async () => {
    await getDatabase(uid());
    const ctx = await getTrainingContext(7);
    expect(ctx).toBeNull();
  });

  it('produces recent-session summary from legacy workout_sets', async () => {
    const db = await getDatabase(uid());
    await seedLegacySession(db);
    const ctx = await getTrainingContext(7);
    expect(ctx).toBeTruthy();
    expect(ctx.recentSessions.length).toBe(1);
    expect(ctx.recentSessions[0].exercises).toEqual(expect.arrayContaining(['Bench', 'Squat']));
  });

  it('is unaffected by presence of session_blocks rows (Phase 0 safety net)', async () => {
    const db = await getDatabase(uid());
    await seedLegacySession(db);

    // Simulate a *separate* block-based session existing alongside.
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus, started_at, ended_at) VALUES (?, ?, datetime('now','-2 days'), datetime('now','-2 days','+30 minutes'))",
      [2, 'hiit']
    );
    await db.runAsync(
      "INSERT INTO session_blocks (session_id, block_index, block_type, label) VALUES (?, ?, ?, ?)",
      [sess.lastInsertRowId, 0, 'interval', '30/15']
    );

    const ctx = await getTrainingContext(7);
    // Legacy-derived analytics still present and correct.
    expect(ctx.recentSessions.length).toBe(1); // only the strength session surfaces
    expect(ctx.recentSessions[0].exercises).toEqual(expect.arrayContaining(['Bench', 'Squat']));
  });
});

describe('legacyCompat.mapLegacyGoal', () => {
  it('maps the three legacy goals into canonical taxonomy', () => {
    expect(mapLegacyGoal('build_muscle').primary).toBe('hypertrophy');
    expect(mapLegacyGoal('lose_fat').primary).toBe('body_composition');
    expect(mapLegacyGoal('increase_strength').primary).toBe('strength');
  });
  it('passes through already-canonical objects', () => {
    const obj = { primary: 'hyrox', modalities: ['strength', 'cardio'] };
    expect(mapLegacyGoal(obj)).toBe(obj);
  });
  it('returns unknown for unrecognized strings', () => {
    expect(mapLegacyGoal('yoga').source).toBe('unknown');
  });
  it('handles arrays', () => {
    const out = mapLegacyGoal(['build_muscle', 'increase_strength']);
    expect(out).toHaveLength(2);
    expect(out[0].primary).toBe('hypertrophy');
  });
  it('returns null for null/undefined', () => {
    expect(mapLegacyGoal(null)).toBeNull();
    expect(mapLegacyGoal(undefined)).toBeNull();
  });
});

describe('legacyCompat.workoutSetsToBlocks', () => {
  it('groups sets by exercise into synthetic strength blocks', () => {
    const rows = [
      { session_id: 1, exercise_name: 'Bench', set_number: 1, weight: 60, weight_unit: 'kg', reps: 8, logged_at: 't1' },
      { session_id: 1, exercise_name: 'Bench', set_number: 2, weight: 62.5, weight_unit: 'kg', reps: 8, logged_at: 't2' },
      { session_id: 1, exercise_name: 'Row', set_number: 1, weight: 50, weight_unit: 'kg', reps: 10, logged_at: 't3' },
    ];
    const blocks = workoutSetsToBlocks(1, rows);
    expect(blocks).toHaveLength(2);
    const bench = blocks.find(b => b.label === 'Bench');
    expect(bench.block_type).toBe('strength');
    expect(bench.entries).toHaveLength(2);
    expect(bench.config.target_sets).toBe(2);
    expect(bench.entries[0].entry_type).toBe('strength_set');
  });
  it('returns [] for empty input', () => {
    expect(workoutSetsToBlocks(1, [])).toEqual([]);
    expect(workoutSetsToBlocks(1, null)).toEqual([]);
  });
});
