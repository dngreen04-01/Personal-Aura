const { buildGreetingContext } = require('../../server/agents/memory');

describe('buildGreetingContext', () => {
  it('returns empty string when no data provided', () => {
    expect(buildGreetingContext({})).toBe('');
  });

  it('includes goal and equipment', () => {
    const result = buildGreetingContext({ goal: 'muscle_gain', equipment: 'full_gym' });
    expect(result).toContain("User's goal: muscle_gain");
    expect(result).toContain('Available equipment: full_gym');
  });

  it('uses 8 min/exercise for duration estimates', () => {
    const result = buildGreetingContext({ todayFocus: 'Upper Body', todayExerciseCount: 6 });
    expect(result).toContain('6 exercises (~48 min)');
    expect(result).not.toContain('~24 min');
  });

  it('omits exercise info when count is zero or missing', () => {
    const result = buildGreetingContext({ todayFocus: 'Legs', todayExerciseCount: 0 });
    expect(result).toContain("Today's scheduled workout: Legs");
    expect(result).not.toContain('exercises');
  });

  it('includes streak when current > 0', () => {
    const result = buildGreetingContext({ streak: { current: 5 } });
    expect(result).toContain('Current streak: 5 days');
  });

  it('omits streak when current is 0', () => {
    const result = buildGreetingContext({ streak: { current: 0 } });
    expect(result).not.toContain('streak');
  });

  it('includes last workout with date', () => {
    const result = buildGreetingContext({
      lastWorkoutFocus: 'Push',
      lastWorkoutDate: '2026-03-28T10:00:00Z',
    });
    expect(result).toContain('Last workout: Push on');
  });

  it('includes volume trend direction', () => {
    const up = buildGreetingContext({ progressSummary: { volumeTrend: 12 } });
    expect(up).toContain('up 12%');

    const down = buildGreetingContext({ progressSummary: { volumeTrend: -5 } });
    expect(down).toContain('down 5%');
  });

  it('includes recent PRs', () => {
    const result = buildGreetingContext({
      progressSummary: {
        recentPRs: [
          { exercise_name: 'Bench Press', max_weight: 100, weight_unit: 'kg' },
          { exercise_name: 'Squat', max_weight: 225, weight_unit: 'lbs' },
        ],
      },
    });
    expect(result).toContain('Bench Press (100kg)');
    expect(result).toContain('Squat (225lbs)');
  });

  it('defaults weight_unit to kg when missing', () => {
    const result = buildGreetingContext({
      progressSummary: {
        recentPRs: [{ exercise_name: 'Deadlift', max_weight: 180 }],
      },
    });
    expect(result).toContain('Deadlift (180kg)');
  });

  it('formats full context with User Context header', () => {
    const result = buildGreetingContext({ goal: 'strength', sessionCount: 10 });
    expect(result).toMatch(/^User Context:\n/);
  });
});
