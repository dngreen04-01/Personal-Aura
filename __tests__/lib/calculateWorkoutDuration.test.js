const {
  calculateWorkoutDuration,
  parseTargetMinutesFromInstruction,
  describeFormulaForPrompt,
} = require('../../lib/calculateWorkoutDuration');

describe('calculateWorkoutDuration', () => {
  it('honors the minimum floor for empty input', () => {
    expect(calculateWorkoutDuration(null)).toBeGreaterThanOrEqual(30);
    expect(calculateWorkoutDuration({})).toBeGreaterThanOrEqual(30);
    expect(calculateWorkoutDuration({ exercises: [] })).toBeGreaterThanOrEqual(30);
  });

  it('computes strength-block duration from sets × (reps work + rest)', () => {
    // 6 strength blocks × 3 sets × (9 reps × 3s + 90s rest) = 6 × 3 × 117 = 2106s
    // + 180s warmup = 2286s ≈ 38 min
    const blocks = Array.from({ length: 6 }, () => ({
      block_type: 'strength',
      config: { target_sets: 3, target_reps: '8-10', rest_seconds: 90 },
    }));
    const minutes = calculateWorkoutDuration({ blocks });
    expect(minutes).toBeGreaterThanOrEqual(36);
    expect(minutes).toBeLessThanOrEqual(42);
  });

  it('targets ~90 minutes with a realistic full-body block layout', () => {
    // 8 strength × 4 sets × (10 reps × 3 + 120s) = 8 × 4 × 150 = 4800s
    // + 180s warmup = 4980s ≈ 83 min
    const blocks = Array.from({ length: 8 }, () => ({
      block_type: 'strength',
      config: { target_sets: 4, target_reps: '8-12', rest_seconds: 120 },
    }));
    const minutes = calculateWorkoutDuration({ blocks });
    expect(minutes).toBeGreaterThanOrEqual(80);
    expect(minutes).toBeLessThanOrEqual(90);
  });

  it('adds amrap time_cap_sec directly', () => {
    const blocks = [
      { block_type: 'strength', config: { target_sets: 3, target_reps: '10', rest_seconds: 90 } },
      { block_type: 'amrap', config: { time_cap_sec: 1200, movements: [] } },
    ];
    // strength: 3 × (30 + 90) = 360s
    // amrap: 1200s
    // warmup: 180s → 1740s ≈ 29 min → floored to 30
    expect(calculateWorkoutDuration({ blocks })).toBe(30);
  });

  it('handles emom, timed, interval, circuit, cardio, distance', () => {
    const blocks = [
      { block_type: 'emom', config: { minutes: 10, movements: [] } },              // 600s
      { block_type: 'timed', config: { duration_sec: 120 } },                      // 120s
      { block_type: 'interval', config: { work_sec: 30, rest_sec: 30, rounds: 8 } }, // 480s
      { block_type: 'circuit', config: { rounds: 3, stations: [{ reps: 10 }, { duration_sec: 45 }] } }, // 3 × (30+45) = 225s
      { block_type: 'cardio', config: { modality: 'row', duration_sec: 300 } },    // 300s
      { block_type: 'distance', config: { target_distance_m: 1000 } },             // 300s
    ];
    // total 2025s + 180 warmup = 2205s ≈ 37 min
    const minutes = calculateWorkoutDuration({ blocks });
    expect(minutes).toBeGreaterThanOrEqual(35);
    expect(minutes).toBeLessThanOrEqual(40);
  });

  it('falls back to legacy exercises[] shape', () => {
    const exercises = [
      { sets: 3, reps: '8-10', restSeconds: 90 },
      { sets: 4, reps: '12', restSeconds: 60 },
      { sets: 3, reps: '10', restSeconds: 90 },
    ];
    // ex1: 3 × (9×3 + 90) = 351; ex2: 4 × (12×3 + 60) = 384; ex3: 3 × (30+90) = 360
    // total 1095 + 180 = 1275s ≈ 21 min → floored to 30
    expect(calculateWorkoutDuration({ exercises })).toBe(30);
  });

  it('prefers blocks over exercises when both present', () => {
    const blocks = Array.from({ length: 10 }, () => ({
      block_type: 'strength',
      config: { target_sets: 5, target_reps: '10', rest_seconds: 180 },
    }));
    const exercises = [{ sets: 1, reps: '1', restSeconds: 10 }];
    expect(calculateWorkoutDuration({ blocks, exercises })).toBeGreaterThan(60);
  });
});

describe('parseTargetMinutesFromInstruction', () => {
  it('parses hours', () => {
    expect(parseTargetMinutesFromInstruction('1.5 hour full body workout')).toBe(90);
    expect(parseTargetMinutesFromInstruction('2 hr push day')).toBe(120);
    expect(parseTargetMinutesFromInstruction('give me a 1 h session')).toBe(60);
  });

  it('parses minutes', () => {
    expect(parseTargetMinutesFromInstruction('30 minute upper body')).toBe(30);
    expect(parseTargetMinutesFromInstruction('45 mins kettlebell')).toBe(45);
    expect(parseTargetMinutesFromInstruction('20 min conditioning')).toBe(20);
  });

  it('returns null when no duration mentioned', () => {
    expect(parseTargetMinutesFromInstruction('something harder today')).toBeNull();
    expect(parseTargetMinutesFromInstruction(null)).toBeNull();
    expect(parseTargetMinutesFromInstruction('')).toBeNull();
  });
});

describe('describeFormulaForPrompt', () => {
  it('produces a non-empty multi-line description that mentions every block type', () => {
    const text = describeFormulaForPrompt();
    for (const t of ['strength', 'interval', 'amrap', 'emom', 'circuit', 'timed', 'rest', 'distance', 'cardio']) {
      expect(text).toContain(t);
    }
  });
});
