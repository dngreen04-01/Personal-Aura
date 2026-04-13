/**
 * Motivation Engine — deterministic RPE-based coaching directives.
 * Server-side (CommonJS). Evaluates after orchestrator log_set function calls
 * to shape response tone and weight adjustment suggestions.
 *
 * Increments are expressed as `magnitude` multipliers of the equipment-aware
 * base increment from getDefaultIncrement(unit, exerciseName). A deadlift
 * therefore gets +5kg per step while a dumbbell curl gets +2kg — no exercise
 * ever receives a sub-minimum suggestion like +1.25kg on a barbell compound.
 */

const { getDefaultIncrement } = require('../../lib/incrementUtils');

/**
 * RPE Decision Matrix.
 * `magnitude` = number of base-increment steps for this exercise's equipment.
 *   1 = one step (e.g. +5kg deadlift, +2kg dumbbell curl)
 *   2 = double step (for very low RPE where a single step isn't enough)
 * `template` = coaching hint with {amount} placeholder (e.g. "5kg").
 */
const RPE_MATRIX = {
  strength: {
    // Target RPE: 8
    thresholds: [
      { maxRpe: 5,  tone: 'push',     direction: 'increase', magnitude: 2, template: 'That felt light — jump up {amount} next set.' },
      { maxRpe: 6,  tone: 'push',     direction: 'increase', magnitude: 1, template: 'Room to grow — add {amount} next set.' },
      { maxRpe: 7,  tone: 'maintain', direction: null,       magnitude: 0, template: 'Good effort. Stay at this weight.' },
      { maxRpe: 8,  tone: 'maintain', direction: null,       magnitude: 0, template: 'Right on target. Keep it here.' },
      { maxRpe: 9,  tone: 'ease',     direction: null,       magnitude: 0, template: 'That was tough — hold steady or back off slightly.' },
      { maxRpe: 10, tone: 'deload',   direction: 'decrease', magnitude: 2, template: 'Max effort — consider deloading {amount} next session.' },
    ],
  },
  hypertrophy: {
    // Target RPE: 7
    thresholds: [
      { maxRpe: 5,  tone: 'push',     direction: 'increase', magnitude: 2, template: 'Way under the stimulus zone — add {amount}.' },
      { maxRpe: 6,  tone: 'push',     direction: 'increase', magnitude: 1, template: 'Bump it up {amount} for better stimulus.' },
      { maxRpe: 7,  tone: 'maintain', direction: null,       magnitude: 0, template: 'Perfect zone for muscle growth. Hold here.' },
      { maxRpe: 8,  tone: 'ease',     direction: 'decrease', magnitude: 1, template: 'A bit heavy for hypertrophy — drop {amount}.' },
      { maxRpe: 9,  tone: 'ease',     direction: 'decrease', magnitude: 1, template: 'Too heavy for growth reps — drop {amount}.' },
      { maxRpe: 10, tone: 'deload',   direction: 'decrease', magnitude: 2, template: 'Way too heavy — drop {amount} and focus on form.' },
    ],
  },
  fat_loss: {
    // Target RPE: 6
    thresholds: [
      { maxRpe: 5,  tone: 'push',     direction: 'increase', magnitude: 1, template: 'You can handle more — add {amount}.' },
      { maxRpe: 6,  tone: 'maintain', direction: null,       magnitude: 0, template: 'Good pace. Stay at this weight.' },
      { maxRpe: 7,  tone: 'ease',     direction: null,       magnitude: 0, template: 'Getting heavy — keep form tight or lower slightly.' },
      { maxRpe: 8,  tone: 'ease',     direction: 'decrease', magnitude: 1, template: 'Too heavy for fat-loss tempo — drop {amount}.' },
      { maxRpe: 9,  tone: 'ease',     direction: 'decrease', magnitude: 1, template: 'Back off {amount} — keep the pace sustainable.' },
      { maxRpe: 10, tone: 'deload',   direction: 'decrease', magnitude: 2, template: 'Max effort is counterproductive here — drop {amount}.' },
    ],
  },
};

/**
 * Normalize user goal strings to matrix keys.
 */
function normalizeGoal(goalString) {
  const lower = (goalString || '').toLowerCase();
  if (lower.includes('strength')) return 'strength';
  if (lower.includes('fat') || lower.includes('lose') || lower.includes('lean')) return 'fat_loss';
  return 'hypertrophy'; // "Build Muscle" / default
}

/**
 * Format an increment value for display.
 * kg: drop trailing .0 (5 not 5.0), keep .5 when present (2.5).
 * lbs: integer.
 */
function formatAmount(value, unit) {
  if (unit === 'lbs') return `${Math.round(value)}lbs`;
  return `${value % 1 === 0 ? value : value.toFixed(1)}kg`;
}

/**
 * Evaluate a single set and return coaching directives.
 * @param {{ rpe: number, goal: string, currentWeight?: number, weightUnit?: string, exerciseName?: string }} params
 */
function evaluateSet({ rpe, goal, currentWeight, weightUnit, exerciseName }) {
  const normalizedGoal = normalizeGoal(goal);
  const matrix = RPE_MATRIX[normalizedGoal];

  if (rpe == null || !matrix) {
    return {
      tone: 'maintain',
      weightAdjustment: null,
      messageHint: 'Keep going!',
      celebration: null,
      equipmentContext: null,
    };
  }

  const roundedRpe = Math.round(rpe);
  const entry = matrix.thresholds.find(t => roundedRpe <= t.maxRpe)
             ?? matrix.thresholds[matrix.thresholds.length - 1];

  const unit = weightUnit || 'kg';
  const baseIncrement = getDefaultIncrement(unit, exerciseName);
  const amount = entry.magnitude > 0 ? baseIncrement * entry.magnitude : 0;
  const amountStr = formatAmount(amount, unit);

  const messageHint = entry.template.replace('{amount}', amountStr);

  const weightAdjustment = entry.direction && amount > 0
    ? { value: amount, unit, direction: entry.direction }
    : null;

  return {
    tone: entry.tone,
    weightAdjustment,
    messageHint,
    celebration: null,
    equipmentContext: {
      baseIncrement,
      unit,
      exerciseName: exerciseName || null,
    },
  };
}

/** Streak milestones to celebrate */
const STREAK_MILESTONES = [3, 5, 7, 10, 14, 21, 30];
/** Session milestones to celebrate */
const SESSION_MILESTONES = [10, 25, 50, 100];

/**
 * Check for milestone achievements.
 */
function checkMilestone({ currentWeight, exerciseMaxWeight, streakData, completedSessions }) {
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

/**
 * Build a motivation directive string for system prompt injection.
 * Framed as guidance + floor, not a verbatim script — the LLM can reason
 * about context (recent PRs, fatigue) but must not suggest increments
 * smaller than the equipment minimum.
 */
function buildMotivationDirective(evaluation, milestone) {
  const parts = [`MOTIVATION DIRECTIVE:`];
  parts.push(`- Tone: ${evaluation.tone}`);

  if (evaluation.equipmentContext) {
    const { baseIncrement, unit, exerciseName } = evaluation.equipmentContext;
    const label = exerciseName ? `${exerciseName}` : 'this exercise';
    parts.push(`- Equipment floor: ${label} loads in ${formatAmount(baseIncrement, unit)} minimum jumps.`);
  }

  if (evaluation.weightAdjustment) {
    const adj = evaluation.weightAdjustment;
    const sign = adj.direction === 'increase' ? '+' : '-';
    parts.push(`- Suggested adjustment: ${sign}${formatAmount(adj.value, adj.unit)}`);
  } else {
    parts.push(`- Suggested adjustment: hold current weight`);
  }

  parts.push(`- Coaching angle: ${evaluation.messageHint}`);
  parts.push(`- IMPORTANT: Treat the suggested adjustment as a floor. Never suggest a smaller increment than the equipment minimum above. Phrase naturally — if context (recent PR, unusual fatigue, form breakdown) warrants holding or a larger jump, use judgment.`);

  if (milestone) {
    parts.push(`- CELEBRATION: ${milestone.message}`);
  }

  return parts.join('\n');
}

module.exports = { evaluateSet, checkMilestone, buildMotivationDirective, normalizeGoal, RPE_MATRIX };
