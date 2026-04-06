const { validateBlockPlan, BLOCK_TYPES } = require('../../lib/validateBlockPlan');

describe('validateBlockPlan', () => {
  it('rejects non-object input', () => {
    expect(validateBlockPlan(null).valid).toBe(false);
    expect(validateBlockPlan(undefined).valid).toBe(false);
    expect(validateBlockPlan('nope').valid).toBe(false);
  });

  it('rejects missing/empty blocks array', () => {
    expect(validateBlockPlan({}).valid).toBe(false);
    expect(validateBlockPlan({ blocks: [] }).valid).toBe(false);
    expect(validateBlockPlan({ blocks: 'not-array' }).valid).toBe(false);
  });

  it('rejects unknown block_type', () => {
    const r = validateBlockPlan({ blocks: [{ block_type: 'cryotherapy', config: {} }] });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/unknown block_type/);
  });

  it('exposes 9 canonical block types', () => {
    expect(BLOCK_TYPES).toHaveLength(9);
    expect(BLOCK_TYPES).toEqual(
      expect.arrayContaining(['strength', 'interval', 'amrap', 'emom', 'circuit', 'timed', 'distance', 'cardio', 'rest'])
    );
  });

  describe('strength', () => {
    it('valid when exercise + target_sets present', () => {
      const r = validateBlockPlan({
        blocks: [{ block_type: 'strength', label: 'Squat', config: { exercise: 'Back Squat', target_sets: 4, target_reps: '5-8' } }],
      });
      expect(r.valid).toBe(true);
      expect(r.normalized.blocks[0].block_index).toBe(0);
      expect(r.normalized.blocks[0].config.exercise).toBe('Back Squat');
    });
    it('fails without exercise', () => {
      const r = validateBlockPlan({ blocks: [{ block_type: 'strength', config: { target_sets: 3 } }] });
      expect(r.valid).toBe(false);
    });
    it('fails with target_sets < 1', () => {
      const r = validateBlockPlan({ blocks: [{ block_type: 'strength', config: { exercise: 'Bench', target_sets: 0 } }] });
      expect(r.valid).toBe(false);
    });
  });

  describe('interval', () => {
    it('valid with work/rest/rounds', () => {
      const r = validateBlockPlan({
        blocks: [{ block_type: 'interval', config: { work_sec: 30, rest_sec: 15, rounds: 8 } }],
      });
      expect(r.valid).toBe(true);
    });
    it('fails with zero work_sec', () => {
      const r = validateBlockPlan({
        blocks: [{ block_type: 'interval', config: { work_sec: 0, rest_sec: 15, rounds: 8 } }],
      });
      expect(r.valid).toBe(false);
    });
  });

  describe('amrap', () => {
    it('valid with cap + movements', () => {
      const r = validateBlockPlan({
        blocks: [{ block_type: 'amrap', config: { time_cap_sec: 600, movements: [{ name: 'pullup', reps: 5 }] } }],
      });
      expect(r.valid).toBe(true);
    });
    it('fails without movements', () => {
      const r = validateBlockPlan({ blocks: [{ block_type: 'amrap', config: { time_cap_sec: 600, movements: [] } }] });
      expect(r.valid).toBe(false);
    });
  });

  describe('emom', () => {
    it('valid with minutes + movements', () => {
      const r = validateBlockPlan({
        blocks: [{ block_type: 'emom', config: { minutes: 10, movements: [{ name: 'kb swing', reps: 15 }] } }],
      });
      expect(r.valid).toBe(true);
    });
  });

  describe('circuit', () => {
    it('valid with stations + rounds', () => {
      const r = validateBlockPlan({
        blocks: [{ block_type: 'circuit', config: { stations: [{ name: 'sled push' }], rounds: 3 } }],
      });
      expect(r.valid).toBe(true);
    });
  });

  describe('timed', () => {
    it('valid with duration_sec', () => {
      const r = validateBlockPlan({ blocks: [{ block_type: 'timed', config: { duration_sec: 120 } }] });
      expect(r.valid).toBe(true);
    });
  });

  describe('distance', () => {
    it('valid with target_distance_m', () => {
      const r = validateBlockPlan({ blocks: [{ block_type: 'distance', config: { target_distance_m: 1000 } }] });
      expect(r.valid).toBe(true);
    });
  });

  describe('cardio', () => {
    it('valid with modality + distance', () => {
      const r = validateBlockPlan({
        blocks: [{ block_type: 'cardio', config: { modality: 'run', target_distance_m: 5000 } }],
      });
      expect(r.valid).toBe(true);
    });
    it('valid with modality + duration', () => {
      const r = validateBlockPlan({
        blocks: [{ block_type: 'cardio', config: { modality: 'row', duration_sec: 900 } }],
      });
      expect(r.valid).toBe(true);
    });
    it('fails without modality', () => {
      const r = validateBlockPlan({ blocks: [{ block_type: 'cardio', config: { duration_sec: 900 } }] });
      expect(r.valid).toBe(false);
    });
    it('fails without duration and distance', () => {
      const r = validateBlockPlan({ blocks: [{ block_type: 'cardio', config: { modality: 'run' } }] });
      expect(r.valid).toBe(false);
    });
  });

  describe('rest', () => {
    it('valid with duration_sec', () => {
      const r = validateBlockPlan({ blocks: [{ block_type: 'rest', config: { duration_sec: 90 } }] });
      expect(r.valid).toBe(true);
    });
  });

  it('normalizes block_index by array position', () => {
    const r = validateBlockPlan({
      blocks: [
        { block_type: 'rest', config: { duration_sec: 60 } },
        { block_type: 'strength', config: { exercise: 'Squat', target_sets: 3 } },
        { block_type: 'cardio', config: { modality: 'run', duration_sec: 600 } },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.normalized.blocks.map(b => b.block_index)).toEqual([0, 1, 2]);
  });

  it('aggregates errors across multiple bad blocks', () => {
    const r = validateBlockPlan({
      blocks: [
        { block_type: 'strength', config: {} },
        { block_type: 'interval', config: { work_sec: -1, rest_sec: 15, rounds: 0 } },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});
