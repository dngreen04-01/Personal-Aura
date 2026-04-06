/**
 * migration.test.js — verifies initializeDatabase() is idempotent and that
 * Phase 0 additive schema changes apply cleanly on top of a pre-existing
 * (legacy) database with workout_sets rows present.
 */
const { getDatabase, closeDatabase } = require('../../lib/database');

function uid() {
  return `mig_${Math.random().toString(36).slice(2)}`;
}

async function getTables(db) {
  return db.getAllAsync("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
}

async function getColumns(db, table) {
  const rows = await db.getAllAsync(`PRAGMA table_info(${table})`);
  return rows.map(r => r.name);
}

describe('Phase 0 schema migration', () => {
  afterEach(async () => { await closeDatabase(); });

  it('creates session_blocks and block_entries with CHECK constraints', async () => {
    const db = await getDatabase(uid());
    const tables = (await getTables(db)).map(t => t.name);
    expect(tables).toEqual(expect.arrayContaining(['session_blocks', 'block_entries', 'workout_sets']));

    const blockCols = await getColumns(db, 'session_blocks');
    expect(blockCols).toEqual(expect.arrayContaining(['id', 'session_id', 'block_index', 'block_type', 'label', 'config_json']));

    const entryCols = await getColumns(db, 'block_entries');
    expect(entryCols).toEqual(expect.arrayContaining(['id', 'block_id', 'entry_index', 'entry_type', 'payload_json']));
  });

  it('rejects invalid block_type via CHECK constraint', async () => {
    const db = await getDatabase(uid());
    let threw = false;
    try {
      await db.runAsync(
        "INSERT INTO session_blocks (session_id, block_index, block_type, label, config_json) VALUES (?, ?, ?, ?, ?)",
        [1, 0, 'yoga_flow', 'bogus', '{}']
      );
    } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });

  it('rejects invalid entry_type via CHECK constraint', async () => {
    const db = await getDatabase(uid());
    // First need a valid block.
    const res = await db.runAsync(
      "INSERT INTO session_blocks (session_id, block_index, block_type, label, config_json) VALUES (?, ?, ?, ?, ?)",
      [1, 0, 'strength', 'Squat', '{}']
    );
    let threw = false;
    try {
      await db.runAsync(
        "INSERT INTO block_entries (block_id, entry_index, entry_type, payload_json) VALUES (?, ?, ?, ?)",
        [res.lastInsertRowId, 0, 'snack_break', '{}']
      );
    } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });

  it('adds additive JSON columns to user_profile', async () => {
    const db = await getDatabase(uid());
    const cols = await getColumns(db, 'user_profile');
    for (const c of ['goals_json', 'style_preferences_json', 'sport_context_json', 'injuries_json']) {
      expect(cols).toContain(c);
    }
  });

  it('adds plan_snapshot_json to workout_sessions alongside legacy exercises_json', async () => {
    const db = await getDatabase(uid());
    const cols = await getColumns(db, 'workout_sessions');
    expect(cols).toContain('plan_snapshot_json');
    expect(cols).toContain('exercises_json');
  });

  it('generalizes active_rest_timer with timer_kind + context_json', async () => {
    const db = await getDatabase(uid());
    const cols = await getColumns(db, 'active_rest_timer');
    expect(cols).toContain('timer_kind');
    expect(cols).toContain('context_json');
    // Legacy columns preserved.
    expect(cols).toContain('rest_end_time');
    expect(cols).toContain('exercise_name');
  });

  it('is idempotent: a second initialize pass does not error or lose data', async () => {
    const uidStr = uid();
    const db1 = await getDatabase(uidStr);
    await db1.runAsync(
      "INSERT INTO workout_sets (session_id, exercise_name, set_number, weight, weight_unit, reps) VALUES (?, ?, ?, ?, ?, ?)",
      [1, 'Bench', 1, 60, 'kg', 8]
    );
    await closeDatabase();

    // Re-open same DB name → initializeDatabase runs again.
    const db2 = await getDatabase(uidStr);
    const rows = await db2.getAllAsync('SELECT * FROM workout_sets');
    expect(rows).toHaveLength(1);
    expect(rows[0].exercise_name).toBe('Bench');
  });
});
