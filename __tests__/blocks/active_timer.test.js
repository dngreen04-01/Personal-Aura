/**
 * active_timer.test.js — the legacy active_rest_timer is generalized in
 * Phase 0 into an active_timer surface (single-row table, additive columns
 * timer_kind + context_json) that can describe rest / interval / amrap /
 * emom countdowns. Existing rest-timer writes keep working unchanged.
 */
const { getDatabase, closeDatabase } = require('../../lib/database');

function uid() { return `timer_${Math.random().toString(36).slice(2)}`; }

async function upsertTimer(db, { endTime, kind = 'rest', context = null, exerciseName = null, setNumber = null }) {
  await db.runAsync('DELETE FROM active_rest_timer');
  await db.runAsync(
    `INSERT INTO active_rest_timer (id, rest_end_time, exercise_name, set_number, timer_kind, context_json)
     VALUES (1, ?, ?, ?, ?, ?)`,
    [endTime, exerciseName, setNumber, kind, context ? JSON.stringify(context) : null]
  );
}

describe('active timer persistence (generalized rest timer)', () => {
  afterEach(async () => { await closeDatabase(); });

  it('persists a rest-kind timer (legacy path)', async () => {
    const db = await getDatabase(uid());
    const endTime = Date.now() + 60_000;
    await upsertTimer(db, { endTime, kind: 'rest', exerciseName: 'Bench', setNumber: 2 });
    const row = await db.getFirstAsync('SELECT * FROM active_rest_timer WHERE id = 1');
    expect(row.timer_kind).toBe('rest');
    expect(row.exercise_name).toBe('Bench');
    expect(row.rest_end_time).toBe(endTime);
  });

  it('persists an interval-kind timer with context', async () => {
    const db = await getDatabase(uid());
    const ctx = { work_sec: 30, rest_sec: 15, round: 4, total_rounds: 8 };
    await upsertTimer(db, { endTime: Date.now() + 15_000, kind: 'interval', context: ctx });
    const row = await db.getFirstAsync('SELECT * FROM active_rest_timer WHERE id = 1');
    expect(row.timer_kind).toBe('interval');
    expect(JSON.parse(row.context_json).round).toBe(4);
  });

  it('persists an amrap-kind timer', async () => {
    const db = await getDatabase(uid());
    await upsertTimer(db, { endTime: Date.now() + 600_000, kind: 'amrap', context: { time_cap_sec: 600 } });
    const row = await db.getFirstAsync('SELECT timer_kind, context_json FROM active_rest_timer WHERE id = 1');
    expect(row.timer_kind).toBe('amrap');
    expect(JSON.parse(row.context_json).time_cap_sec).toBe(600);
  });

  it('enforces single-row constraint (id = 1)', async () => {
    const db = await getDatabase(uid());
    await upsertTimer(db, { endTime: Date.now() + 30_000 });
    let threw = false;
    try {
      await db.runAsync(
        'INSERT INTO active_rest_timer (id, rest_end_time) VALUES (?, ?)',
        [2, Date.now() + 30_000]
      );
    } catch (e) { threw = true; }
    expect(threw).toBe(true);
  });

  it('timer_kind defaults to "rest" when omitted (legacy callers)', async () => {
    const db = await getDatabase(uid());
    await db.runAsync('DELETE FROM active_rest_timer');
    // Legacy INSERT shape (no timer_kind / context_json).
    await db.runAsync(
      'INSERT INTO active_rest_timer (id, rest_end_time, exercise_name, set_number) VALUES (1, ?, ?, ?)',
      [Date.now() + 60_000, 'Squat', 1]
    );
    const row = await db.getFirstAsync('SELECT * FROM active_rest_timer WHERE id = 1');
    expect(row.timer_kind).toBe('rest');
    expect(row.context_json).toBeNull();
  });
});
