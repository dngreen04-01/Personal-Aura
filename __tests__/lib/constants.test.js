const { MINUTES_PER_EXERCISE, MIN_WORKOUT_DURATION } = require('../../lib/constants');

describe('constants', () => {
  it('exports MINUTES_PER_EXERCISE as 8', () => {
    expect(MINUTES_PER_EXERCISE).toBe(8);
  });

  it('exports MIN_WORKOUT_DURATION as 30', () => {
    expect(MIN_WORKOUT_DURATION).toBe(30);
  });

  it('duration estimate matches InlineWorkoutCard formula', () => {
    // 6 exercises * 8 min = 48, above minimum of 30
    expect(Math.max(MIN_WORKOUT_DURATION, 6 * MINUTES_PER_EXERCISE)).toBe(48);
  });

  it('minimum kicks in for small exercise counts', () => {
    // 2 exercises * 8 = 16 < 30, so minimum wins
    expect(Math.max(MIN_WORKOUT_DURATION, 2 * MINUTES_PER_EXERCISE)).toBe(30);
  });
});
