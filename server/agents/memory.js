/**
 * Memory Agent — deterministic context normalization layer.
 * No LLM, no database. Pure functions that normalize the different
 * frontend context shapes into a single canonical shape.
 */
const { MINUTES_PER_EXERCISE } = require('../../lib/constants');

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
      weightKg: ctx.weightKg || null,
      gender: ctx.gender || null,
      age: ctx.age || null,
    },
    workout: {
      day: ctx.currentDay?.focus || ctx.currentDay?.day || null,
      exercises: ctx.currentDay?.exercises || null,
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
    trainingHistory: ctx.trainingContext || null,
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

/**
 * Build a greeting context string from user data for the pre-workout greeting.
 * Pure function — formats the data for the greeting system prompt.
 */
function buildGreetingContext({ streak, sessionCount, lastWorkoutFocus, lastWorkoutDate, todayFocus, todayExerciseCount, goal, equipment, progressSummary }) {
  const parts = [];

  if (goal) parts.push(`User's goal: ${goal}`);
  if (equipment) parts.push(`Available equipment: ${equipment}`);
  if (sessionCount) parts.push(`Sessions completed: ${sessionCount}`);
  if (streak && streak.current > 0) parts.push(`Current streak: ${streak.current} days`);
  if (lastWorkoutFocus) {
    const lastDate = lastWorkoutDate ? ` on ${new Date(lastWorkoutDate).toLocaleDateString()}` : '';
    parts.push(`Last workout: ${lastWorkoutFocus}${lastDate}`);
  }
  if (todayFocus) {
    const exerciseInfo = todayExerciseCount ? ` with ${todayExerciseCount} exercises (~${todayExerciseCount * MINUTES_PER_EXERCISE} min)` : '';
    parts.push(`Today's scheduled workout: ${todayFocus}${exerciseInfo}`);
  }
  if (progressSummary) {
    if (progressSummary.volumeTrend != null) {
      const direction = progressSummary.volumeTrend >= 0 ? 'up' : 'down';
      parts.push(`Recent volume trend: ${direction} ${Math.abs(progressSummary.volumeTrend)}% vs prior sessions`);
    }
    if (progressSummary.recentPRs && progressSummary.recentPRs.length > 0) {
      const prList = progressSummary.recentPRs.map(pr => `${pr.exercise_name} (${pr.max_weight}${pr.weight_unit || 'kg'})`).join(', ');
      parts.push(`Recent personal records: ${prList}`);
    }
  }

  return parts.length > 0 ? `User Context:\n${parts.join('\n')}` : '';
}

/**
 * Format training history into a text block for AI system prompts.
 * Produces a compact summary of what was trained in the last 7 days.
 */
function formatTrainingHistory(agentContext) {
  const history = agentContext.trainingHistory;
  if (!history || !history.recentSessions || history.recentSessions.length === 0) {
    return '';
  }

  const parts = ['\nRecent Training History (Last 7 Days):'];

  for (const session of history.recentSessions) {
    const type = session.isPlanned ? 'Planned' : 'Ad-hoc';
    const muscles = session.muscleGroups.length > 0 ? ` [${session.muscleGroups.join(', ')}]` : '';
    parts.push(`- ${session.date}: ${session.focus} (${type}) — ${session.exercises.join(', ')}${muscles}`);
  }

  // Muscle group recency
  if (history.muscleGroupLastTrained && Object.keys(history.muscleGroupLastTrained).length > 0) {
    parts.push('\nMuscle Group Recency:');
    const today = new Date().toISOString().split('T')[0];
    for (const [muscle, lastDate] of Object.entries(history.muscleGroupLastTrained)) {
      const daysSince = Math.round((new Date(today) - new Date(lastDate)) / (1000 * 60 * 60 * 24));
      parts.push(`- ${muscle}: ${daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : daysSince + ' days ago'}`);
    }
  }

  // Exercise weights for smart estimation
  if (history.exerciseWeights && Object.keys(history.exerciseWeights).length > 0) {
    parts.push('\nRecent Exercise Weights:');
    for (const [name, data] of Object.entries(history.exerciseWeights)) {
      const rpeNote = data.avgRpe ? ` (avg RPE ${data.avgRpe})` : '';
      parts.push(`- ${name}: ${data.lastWeight}${data.lastUnit} x${data.lastReps}${rpeNote}`);
    }
  }

  return parts.join('\n');
}

module.exports = { buildAgentContext, formatContextBlock, formatCompletionDirective, buildGreetingContext, formatTrainingHistory };
