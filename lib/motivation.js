/**
 * Motivation Engine — deterministic RPE-based coaching directives.
 * Client-side (ESM). Used in workout.js handleDone flow for instant feedback.
 */

/**
 * RPE Decision Matrix from PRD section 2.5.
 */
export const RPE_MATRIX = {
  strength: {
    thresholds: [
      { maxRpe: 5,  tone: 'push',     direction: 'increase', value: 5,    hint: 'That felt light — add 5kg next set.' },
      { maxRpe: 6,  tone: 'push',     direction: 'increase', value: 2.5,  hint: 'Room to grow — add 2.5kg next set.' },
      { maxRpe: 7,  tone: 'maintain', direction: null,       value: 0,    hint: 'Good effort. Stay at this weight.' },
      { maxRpe: 8,  tone: 'maintain', direction: null,       value: 0,    hint: 'Right on target. Keep it here.' },
      { maxRpe: 9,  tone: 'ease',     direction: null,       value: 0,    hint: 'That was tough — hold steady or back off slightly.' },
      { maxRpe: 10, tone: 'deload',   direction: 'decrease', value: 0,    hint: 'Max effort — consider a deload next session.' },
    ],
  },
  hypertrophy: {
    thresholds: [
      { maxRpe: 5,  tone: 'push',     direction: 'increase', value: 2.5,  hint: 'Too easy for growth — add 2.5kg.' },
      { maxRpe: 6,  tone: 'push',     direction: 'increase', value: 1.25, hint: 'Bump it up 1.25kg for better stimulus.' },
      { maxRpe: 7,  tone: 'maintain', direction: null,       value: 0,    hint: 'Perfect zone for muscle growth. Hold here.' },
      { maxRpe: 8,  tone: 'ease',     direction: 'decrease', value: 2.5,  hint: 'A bit heavy for hypertrophy — drop 2.5kg.' },
      { maxRpe: 9,  tone: 'ease',     direction: 'decrease', value: 5,    hint: 'Too heavy for growth reps — drop 5kg.' },
      { maxRpe: 10, tone: 'deload',   direction: 'decrease', value: 7.5,  hint: 'Way too heavy — drop 7.5kg and focus on form.' },
    ],
  },
  fat_loss: {
    thresholds: [
      { maxRpe: 5,  tone: 'push',     direction: 'increase', value: 2.5,  hint: 'You can handle more — add 2.5kg.' },
      { maxRpe: 6,  tone: 'maintain', direction: null,       value: 0,    hint: 'Good pace. Stay at this weight.' },
      { maxRpe: 7,  tone: 'ease',     direction: null,       value: 0,    hint: 'Getting heavy — keep form tight or lower slightly.' },
      { maxRpe: 8,  tone: 'ease',     direction: 'decrease', value: 2.5,  hint: 'Too heavy for fat-loss tempo — drop 2.5kg.' },
      { maxRpe: 9,  tone: 'ease',     direction: 'decrease', value: 5,    hint: 'Back off 5kg — keep the pace sustainable.' },
      { maxRpe: 10, tone: 'deload',   direction: 'decrease', value: 10,   hint: 'Max effort is counterproductive here — drop 10kg.' },
    ],
  },
};

/**
 * Normalize user goal strings to matrix keys.
 * @param {string} goalString
 * @returns {'strength'|'hypertrophy'|'fat_loss'}
 */
export function normalizeGoal(goalString) {
  const lower = (goalString || '').toLowerCase();
  if (lower.includes('strength')) return 'strength';
  if (lower.includes('fat') || lower.includes('lose') || lower.includes('lean')) return 'fat_loss';
  return 'hypertrophy';
}

/**
 * Evaluate a single set and return coaching directives.
 * @param {{ rpe: number, goal: string, currentWeight?: number, weightUnit?: string, exerciseName?: string }} params
 * @returns {{ tone: string, weightAdjustment: object|null, messageHint: string, celebration: null }}
 */
export function evaluateSet({ rpe, goal, currentWeight, weightUnit, exerciseName }) {
  const normalizedGoal = normalizeGoal(goal);
  const matrix = RPE_MATRIX[normalizedGoal];

  if (rpe == null || !matrix) {
    return { tone: 'maintain', weightAdjustment: null, messageHint: 'Keep going!', celebration: null };
  }

  const roundedRpe = Math.round(rpe);

  const entry = matrix.thresholds.find(t => roundedRpe <= t.maxRpe);
  if (!entry) {
    const last = matrix.thresholds[matrix.thresholds.length - 1];
    return {
      tone: last.tone,
      weightAdjustment: last.direction ? { value: last.value, unit: 'kg', direction: last.direction } : null,
      messageHint: last.hint,
      celebration: null,
    };
  }

  return {
    tone: entry.tone,
    weightAdjustment: entry.direction ? { value: entry.value, unit: 'kg', direction: entry.direction } : null,
    messageHint: entry.hint,
    celebration: null,
  };
}

const STREAK_MILESTONES = [3, 5, 7, 10, 14, 21, 30];
const SESSION_MILESTONES = [10, 25, 50, 100];

/**
 * Check for milestone achievements.
 * @param {{ currentWeight?: number, exerciseMaxWeight?: number, streakData?: { current: number }, completedSessions?: number }} params
 * @returns {{ type: string, message: string }|null}
 */
export function checkMilestone({ currentWeight, exerciseMaxWeight, streakData, completedSessions }) {
  if (currentWeight != null && exerciseMaxWeight != null && currentWeight > exerciseMaxWeight) {
    return { type: 'weight_pr', message: `New personal record! You just lifted ${currentWeight} — that's a PR!` };
  }

  if (streakData?.current && STREAK_MILESTONES.includes(streakData.current)) {
    return { type: 'streak', message: `${streakData.current}-day streak! Consistency is king.` };
  }

  if (completedSessions && SESSION_MILESTONES.includes(completedSessions)) {
    return { type: 'session_count', message: `${completedSessions} sessions completed! That's dedication.` };
  }

  return null;
}
