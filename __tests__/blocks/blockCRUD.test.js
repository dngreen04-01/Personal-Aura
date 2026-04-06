/**
 * blockCRUD.test.js — CRUD on session_blocks and block_entries.
 * Phase 0: raw SQL tests. Phase 1: helper function tests added below.
 */
const { getDatabase, closeDatabase, createSessionBlock, logBlockEntry, getSessionBlocks, getBlockEntries, createBlocksFromPlan, logStrengthSet, logTimedEffort, logRoundEntry } = require('../../lib/database');

function uid() { return `crud_${Math.random().toString(36).slice(2)}`; }

describe('session_blocks / block_entries CRUD', () => {
  afterEach(async () => { await closeDatabase(); });

  it('inserts, reads, updates, deletes a strength block + entries', async () => {
    const db = await getDatabase(uid());

    // Need a session row so block.session_id is meaningful (FKs off in mock).
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)",
      [1, 'upper']
    );
    const sessionId = sess.lastInsertRowId;

    const blockRes = await db.runAsync(
      "INSERT INTO session_blocks (session_id, block_index, block_type, label, config_json) VALUES (?, ?, ?, ?, ?)",
      [sessionId, 0, 'strength', 'Bench Press', JSON.stringify({ exercise: 'Barbell Bench Press', target_sets: 4 })]
    );
    const blockId = blockRes.lastInsertRowId;
    expect(blockId).toBeGreaterThan(0);

    // Insert 4 entries
    for (let i = 0; i < 4; i++) {
      await db.runAsync(
        "INSERT INTO block_entries (block_id, entry_index, entry_type, payload_json) VALUES (?, ?, ?, ?)",
        [blockId, i, 'strength_set', JSON.stringify({ weight: 60 + i * 2.5, reps: 8 })]
      );
    }

    const entries = await db.getAllAsync(
      'SELECT * FROM block_entries WHERE block_id = ? ORDER BY entry_index', [blockId]
    );
    expect(entries).toHaveLength(4);
    expect(JSON.parse(entries[3].payload_json).weight).toBe(67.5);

    // Update
    await db.runAsync(
      "UPDATE block_entries SET payload_json = ? WHERE block_id = ? AND entry_index = ?",
      [JSON.stringify({ weight: 70, reps: 6 }), blockId, 3]
    );
    const updated = await db.getFirstAsync(
      'SELECT payload_json FROM block_entries WHERE block_id = ? AND entry_index = ?', [blockId, 3]
    );
    expect(JSON.parse(updated.payload_json).weight).toBe(70);

    // Delete
    await db.runAsync('DELETE FROM block_entries WHERE block_id = ?', [blockId]);
    const remaining = await db.getAllAsync('SELECT * FROM block_entries WHERE block_id = ?', [blockId]);
    expect(remaining).toHaveLength(0);

    // Block still exists
    const block = await db.getFirstAsync('SELECT * FROM session_blocks WHERE id = ?', [blockId]);
    expect(block.block_type).toBe('strength');
  });

  it('enforces block_type enum via CHECK', async () => {
    const db = await getDatabase(uid());
    let threw = false;
    try {
      await db.runAsync(
        "INSERT INTO session_blocks (session_id, block_index, block_type) VALUES (?, ?, ?)",
        [1, 0, 'totally-made-up']
      );
    } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });

  it('enforces entry_type enum via CHECK', async () => {
    const db = await getDatabase(uid());
    const b = await db.runAsync(
      "INSERT INTO session_blocks (session_id, block_index, block_type) VALUES (?, ?, ?)",
      [1, 0, 'amrap']
    );
    let threw = false;
    try {
      await db.runAsync(
        "INSERT INTO block_entries (block_id, entry_index, entry_type) VALUES (?, ?, ?)",
        [b.lastInsertRowId, 0, 'brunch']
      );
    } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });

  it('accepts all 9 canonical block_types', async () => {
    const db = await getDatabase(uid());
    const types = ['strength','interval','amrap','emom','circuit','timed','distance','cardio','rest'];
    for (let i = 0; i < types.length; i++) {
      await db.runAsync(
        "INSERT INTO session_blocks (session_id, block_index, block_type) VALUES (?, ?, ?)",
        [1, i, types[i]]
      );
    }
    const count = await db.getFirstAsync("SELECT COUNT(*) as c FROM session_blocks");
    expect(count.c).toBe(9);
  });

  it('accepts all 5 canonical entry_types', async () => {
    const db = await getDatabase(uid());
    const b = await db.runAsync(
      "INSERT INTO session_blocks (session_id, block_index, block_type) VALUES (?, ?, ?)",
      [1, 0, 'circuit']
    );
    const types = ['strength_set','timed_effort','distance_effort','round','rest'];
    for (let i = 0; i < types.length; i++) {
      await db.runAsync(
        "INSERT INTO block_entries (block_id, entry_index, entry_type) VALUES (?, ?, ?)",
        [b.lastInsertRowId, i, types[i]]
      );
    }
    const count = await db.getFirstAsync("SELECT COUNT(*) as c FROM block_entries");
    expect(count.c).toBe(5);
  });
});

// --- Phase 1: Helper function tests ---

describe('Block CRUD helper functions', () => {
  afterEach(async () => { await closeDatabase(); });

  it('createSessionBlock inserts and returns id', async () => {
    const db = await getDatabase(uid());
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)", [1, 'upper']
    );
    const blockId = await createSessionBlock(sess.lastInsertRowId, 0, 'strength', 'Bench Press', { exercise: 'Bench Press', target_sets: 4 });
    expect(blockId).toBeGreaterThan(0);

    const row = await db.getFirstAsync('SELECT * FROM session_blocks WHERE id = ?', [blockId]);
    expect(row.block_type).toBe('strength');
    expect(row.label).toBe('Bench Press');
    expect(JSON.parse(row.config_json).target_sets).toBe(4);
  });

  it('logBlockEntry inserts and returns id', async () => {
    const db = await getDatabase(uid());
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)", [1, 'upper']
    );
    const blockId = await createSessionBlock(sess.lastInsertRowId, 0, 'strength', 'Squat', { exercise: 'Squat', target_sets: 3 });
    const entryId = await logBlockEntry(blockId, 1, 'strength_set', { weight: 100, reps: 5 });
    expect(entryId).toBeGreaterThan(0);

    const entries = await getBlockEntries(blockId);
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].payload_json).weight).toBe(100);
  });

  it('getSessionBlocks returns blocks ordered by block_index', async () => {
    const db = await getDatabase(uid());
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)", [1, 'full']
    );
    const sid = sess.lastInsertRowId;
    await createSessionBlock(sid, 1, 'strength', 'B', {});
    await createSessionBlock(sid, 0, 'strength', 'A', {});

    const blocks = await getSessionBlocks(sid);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].label).toBe('A');
    expect(blocks[1].label).toBe('B');
  });

  it('createBlocksFromPlan batch-creates blocks from validated plan', async () => {
    const db = await getDatabase(uid());
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)", [1, 'push']
    );
    const plan = {
      blocks: [
        { block_index: 0, block_type: 'strength', label: 'Bench Press', config: { exercise: 'Bench Press', target_sets: 4 } },
        { block_index: 1, block_type: 'strength', label: 'OHP', config: { exercise: 'OHP', target_sets: 3 } },
      ],
    };
    const result = await createBlocksFromPlan(sess.lastInsertRowId, plan);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('Bench Press');
    expect(result[1].blockType).toBe('strength');

    const blocks = await getSessionBlocks(sess.lastInsertRowId);
    expect(blocks).toHaveLength(2);
  });
});

describe('logStrengthSet dual-write', () => {
  afterEach(async () => { await closeDatabase(); });

  it('writes to both workout_sets and block_entries', async () => {
    const db = await getDatabase(uid());
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)", [1, 'upper']
    );
    const sid = sess.lastInsertRowId;
    const blockId = await createSessionBlock(sid, 0, 'strength', 'Bench', { exercise: 'Bench', target_sets: 4 });

    const setId = await logStrengthSet(sid, blockId, 'Bench', 1, 60, 'kg', 8, 7, 90, { syncToCloud: false });
    expect(setId).toBeGreaterThan(0);

    // Legacy table
    const sets = await db.getAllAsync('SELECT * FROM workout_sets WHERE session_id = ?', [sid]);
    expect(sets).toHaveLength(1);
    expect(sets[0].weight).toBe(60);

    // Block table
    const entries = await getBlockEntries(blockId);
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].payload_json).weight).toBe(60);
  });

  it('succeeds even with null blockId (legacy resume)', async () => {
    const db = await getDatabase(uid());
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)", [1, 'legs']
    );
    const sid = sess.lastInsertRowId;

    const setId = await logStrengthSet(sid, null, 'Squat', 1, 100, 'kg', 5, 8, 120, { syncToCloud: false });
    expect(setId).toBeGreaterThan(0);

    const sets = await db.getAllAsync('SELECT * FROM workout_sets WHERE session_id = ?', [sid]);
    expect(sets).toHaveLength(1);
  });
});

// --- Phase 2: Timer/round entry logging helpers ---

describe('Timer and round entry logging helpers', () => {
  afterEach(async () => { await closeDatabase(); });

  it('logTimedEffort writes a timed_effort entry with context', async () => {
    const db = await getDatabase(uid());
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)", [1, 'hiit']
    );
    const blockId = await createSessionBlock(sess.lastInsertRowId, 0, 'interval', 'HIIT', {
      work_sec: 30, rest_sec: 15, rounds: 8,
    });

    const entryId = await logTimedEffort(blockId, 0, 30, { round: 1, phase: 'work' });
    expect(entryId).toBeGreaterThan(0);

    const entries = await getBlockEntries(blockId);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry_type).toBe('timed_effort');
    const payload = JSON.parse(entries[0].payload_json);
    expect(payload.elapsed_sec).toBe(30);
    expect(payload.round).toBe(1);
    expect(payload.phase).toBe('work');
  });

  it('logRoundEntry writes a round entry with movements', async () => {
    const db = await getDatabase(uid());
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)", [1, 'amrap']
    );
    const blockId = await createSessionBlock(sess.lastInsertRowId, 0, 'amrap', 'AMRAP 10min', {
      time_cap_sec: 600, movements: [{ name: 'burpee', reps: 10 }],
    });

    const entryId = await logRoundEntry(blockId, 0, 1, [{ name: 'burpee', reps: 10 }]);
    expect(entryId).toBeGreaterThan(0);

    const entries = await getBlockEntries(blockId);
    expect(entries).toHaveLength(1);
    expect(entries[0].entry_type).toBe('round');
    const payload = JSON.parse(entries[0].payload_json);
    expect(payload.round).toBe(1);
    expect(payload.movements_completed).toHaveLength(1);
    expect(payload.movements_completed[0].name).toBe('burpee');
  });

  it('logTimedEffort works with null context', async () => {
    const db = await getDatabase(uid());
    const sess = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus) VALUES (?, ?)", [1, 'timed']
    );
    const blockId = await createSessionBlock(sess.lastInsertRowId, 0, 'timed', 'Plank', {
      duration_sec: 60,
    });

    const entryId = await logTimedEffort(blockId, 0, 45, null);
    expect(entryId).toBeGreaterThan(0);

    const entries = await getBlockEntries(blockId);
    const payload = JSON.parse(entries[0].payload_json);
    expect(payload.elapsed_sec).toBe(45);
  });
});
