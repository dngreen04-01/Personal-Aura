/**
 * resume-integration.test.js — session-resume must survive the presence of
 * block-based data. Phase 0 contract: legacy session resume behavior is
 * unchanged; sessions with block_entries don't break getIncompleteSession().
 */
const { getDatabase, closeDatabase, getIncompleteSession, getSessionState } = require('../../lib/database');

function uid() { return `resume_${Math.random().toString(36).slice(2)}`; }

async function startIncompleteSession(db, exercisesJson) {
  // Can't use startSession() helper because it invokes sync paths; use raw SQL
  // mirroring that helper's INSERT shape.
  const res = await db.runAsync(
    "INSERT INTO workout_sessions (plan_day, focus, started_at, exercises_json) VALUES (?, ?, datetime('now'), ?)",
    [1, 'upper', JSON.stringify(exercisesJson)]
  );
  return res.lastInsertRowId;
}

describe('session resume with block coexistence', () => {
  afterEach(async () => { await closeDatabase(); });

  it('resumes a legacy-only incomplete session', async () => {
    const db = await getDatabase(uid());
    const day = { exercises: [{ name: 'Bench', sets: 3 }] };
    const sid = await startIncompleteSession(db, day);
    const incomplete = await getIncompleteSession();
    expect(incomplete).toBeTruthy();
    expect(incomplete.id).toBe(sid);

    const state = await getSessionState(sid);
    expect(JSON.parse(state.exercises_json).exercises[0].name).toBe('Bench');
  });

  it('still resumes a session that also has session_blocks rows attached', async () => {
    const db = await getDatabase(uid());
    const sid = await startIncompleteSession(db, { exercises: [{ name: 'Squat', sets: 5 }] });
    // Attach a block record (future Phase 1 will write these during the session).
    await db.runAsync(
      "INSERT INTO session_blocks (session_id, block_index, block_type, label, config_json) VALUES (?, ?, ?, ?, ?)",
      [sid, 0, 'strength', 'Squat', JSON.stringify({ exercise: 'Squat', target_sets: 5 })]
    );
    const incomplete = await getIncompleteSession();
    expect(incomplete).toBeTruthy();
    expect(incomplete.id).toBe(sid);
  });

  it('ignores block-only sessions that have no exercises_json (they are not legacy-resumable)', async () => {
    const db = await getDatabase(uid());
    // A session with NO exercises_json → not picked up by legacy resume.
    const res = await db.runAsync(
      "INSERT INTO workout_sessions (plan_day, focus, started_at) VALUES (?, ?, datetime('now'))",
      [1, 'hiit']
    );
    await db.runAsync(
      "INSERT INTO session_blocks (session_id, block_index, block_type) VALUES (?, ?, ?)",
      [res.lastInsertRowId, 0, 'interval']
    );
    const incomplete = await getIncompleteSession();
    expect(incomplete).toBeNull();
  });

  it('stores plan_snapshot_json alongside legacy exercises_json without conflict', async () => {
    const db = await getDatabase(uid());
    const sid = await startIncompleteSession(db, { exercises: [{ name: 'Deadlift', sets: 3 }] });
    await db.runAsync(
      "UPDATE workout_sessions SET plan_snapshot_json = ? WHERE id = ?",
      [JSON.stringify({ snapshot: 'immutable', blocks: [] }), sid]
    );
    const row = await db.getFirstAsync('SELECT exercises_json, plan_snapshot_json FROM workout_sessions WHERE id = ?', [sid]);
    expect(JSON.parse(row.exercises_json).exercises[0].name).toBe('Deadlift');
    expect(JSON.parse(row.plan_snapshot_json).snapshot).toBe('immutable');
  });
});
