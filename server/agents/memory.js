/**
 * Memory Agent — deterministic context normalization layer.
 * No LLM, no database. Pure functions that normalize the different
 * frontend context shapes into a single canonical shape.
 */

/**
 * Normalize any frontend context shape into the canonical agent context.
 * Handles the 4 different shapes sent by:
 *   - Chat screen (goal, equipment, currentDay, currentExercise, planSummary, progression)
 *   - Workout chat (goal, equipment, currentExercise, currentSet, targetReps, currentWeight, weightUnit, isResting)
 *   - Workout complete (goal, equipment, workoutComplete)
 *   - Workout summary (goal, equipment, currentDay, planSummary)
 */
function buildAgentContext(userContext) {
  const ctx = userContext || {};

  return {
    user: {
      goal: ctx.goal || null,
      equipment: ctx.equipment || null,
      experience: ctx.experience || null,
      weightUnit: ctx.weightUnit || 'kg',
    },
    workout: {
      day: ctx.currentDay?.focus || ctx.currentDay?.day || null,
      currentExercise: ctx.currentExercise || null,
      currentSet: ctx.currentSet || null,
      totalSets: ctx.totalSets || null,
      targetReps: ctx.targetReps || null,
      currentWeight: ctx.currentWeight || null,
      isResting: ctx.isResting || false,
      sessionId: ctx.sessionId || null,
    },
    location: {
      id: ctx.locationId || null,
      name: ctx.locationName || null,
      equipmentList: ctx.locationEquipment || null,
    },
    progression: ctx.progression ? {
      suggestedWeight: ctx.progression.suggestedWeight || null,
      avgRpe: ctx.progression.avgRpe != null ? ctx.progression.avgRpe : null,
      isPlateaued: ctx.progression.isPlateaued || false,
      pushReason: ctx.progression.pushReason || null,
      rpeTrend: ctx.progression.rpeTrend || null,
    } : null,
    plan: {
      summary: ctx.planSummary || null,
    },
    completion: ctx.workoutComplete ? {
      exercisesDone: ctx.workoutComplete.exercises_done || 0,
      totalSets: ctx.workoutComplete.total_sets || 0,
      totalVolume: ctx.workoutComplete.total_volume || 0,
      durationSeconds: ctx.workoutComplete.duration_seconds || 0,
    } : null,
    motivation: {
      exerciseMaxWeight: ctx.exerciseMaxWeight || null,
      streakData: ctx.streakData || null,
      completedSessions: ctx.completedSessions || null,
    },
  };
}

/**
 * Format the canonical context into the "Current Context:" text block
 * for the system prompt. Extracted from orchestrator.js buildSystemPrompt().
 */
function formatContextBlock(agentContext) {
  const { user, workout, location, progression, plan } = agentContext;

  if (!user.goal) return '';

  const progressionBlock = progression ? `
- Progression Status: ${progression.pushReason || 'On track'}
- Avg RPE: ${progression.avgRpe != null ? progression.avgRpe.toFixed(1) : 'N/A'}
- Suggested Weight: ${progression.suggestedWeight || 'N/A'}${user.weightUnit || 'kg'}
- Plateaued: ${progression.isPlateaued ? 'Yes' : 'No'}` : '';

  return `

Current Context:
- User Goal: ${user.goal}
- Equipment: ${user.equipment || 'Unknown'}
- Today's Focus: ${workout.day || 'General'}
- Current Exercise: ${workout.currentExercise || 'Not started'}
- Weight Unit: ${user.weightUnit || 'kg'}
- Today's Plan: ${plan.summary || 'No plan loaded'}${location?.name ? `\n- Location: ${location.name}${location.equipmentList ? ` (Equipment: ${Array.isArray(location.equipmentList) ? location.equipmentList.join(', ') : location.equipmentList})` : ''}` : ''}${progressionBlock}
`;
}

/**
 * Format the workout-complete directive for the system prompt.
 * Extracted from orchestrator.js buildSystemPrompt().
 */
function formatCompletionDirective(agentContext) {
  const { completion } = agentContext;

  if (!completion) return '';

  return `

IMPORTANT — WORKOUT COMPLETE:
The user just finished their entire workout. Deliver a celebratory, personalized message based on these stats:
- Exercises completed: ${completion.exercisesDone}
- Total sets: ${completion.totalSets}
- Total volume: ${Math.round(completion.totalVolume || 0)}kg
- Duration: ${Math.round((completion.durationSeconds || 0) / 60)} minutes
Write 2-3 sentences. Reference specific stats (volume, exercises, sets). Be genuinely encouraging and vary your tone — don't be generic. This is the last thing they see before leaving.
`;
}

module.exports = { buildAgentContext, formatContextBlock, formatCompletionDirective };
