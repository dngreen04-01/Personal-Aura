const { getUserProfile, getUserActivePlan, getUserSessions, getSessionSets, getCompletedSessionCount, saveNewPlan } = require('../services/firestore');
const { handlePlanRegeneration } = require('../agents/planning');
const { sendPushNotification } = require('../services/notifications');
const { runForAllUsers, logJobResult } = require('../services/scheduler');

async function processUser(uid) {
  // Check eligibility: 7+ sessions since last plan, or 7+ days since plan created
  const profile = await getUserProfile(uid);
  const activePlan = await getUserActivePlan(uid);

  if (!activePlan) return 'skipped';

  const planCreatedAt = activePlan.createdAt ? new Date(activePlan.createdAt) : null;
  const daysSincePlan = planCreatedAt
    ? Math.floor((Date.now() - planCreatedAt.getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;

  const sessionsSincePlan = planCreatedAt
    ? await getCompletedSessionCount(uid, daysSincePlan)
    : 0;

  // Not eligible yet
  if (sessionsSincePlan < 7 && daysSincePlan < 7) return 'skipped';

  // Gather data for plan regeneration
  const sessions = await getUserSessions(uid, { days: 30 });
  const workoutHistory = [];

  for (const session of sessions) {
    const sets = await getSessionSets(uid, session.id);
    workoutHistory.push({
      ...session,
      sets: sets.map(s => ({
        exerciseName: s.exerciseName,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        setNumber: s.setNumber,
      })),
    });
  }

  const currentPlan = typeof activePlan.planJson === 'string'
    ? JSON.parse(activePlan.planJson)
    : activePlan.planJson;

  const userProfile = {
    goal: profile?.goal,
    equipment: profile?.equipment,
    age: profile?.age,
    weight_kg: profile?.weightKg,
    gender: profile?.gender,
  };

  const schedule = {
    daysPerWeek: profile?.daysPerWeek,
    minutesPerSession: profile?.minutesPerSession,
  };

  // Reuse the existing planning agent
  const result = await handlePlanRegeneration({ userProfile, currentPlan, workoutHistory, schedule });

  if (result.plan) {
    await saveNewPlan(uid, result.plan, 'coach');

    await sendPushNotification(uid, {
      title: 'Plan Updated',
      body: 'Your workout plan has been updated based on your progress.',
      data: { type: 'plan_adjusted', changes: result.changes?.length || 0 },
    });
  }

  return 'adjusted';
}

async function runPlanAdjuster() {
  const stats = await runForAllUsers(processUser);
  logJobResult('plan-adjuster', stats);
  return stats;
}

module.exports = { runPlanAdjuster };
