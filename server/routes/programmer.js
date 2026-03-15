const express = require('express');
const { handlePlanRegeneration } = require('../agents/planning');
const { asyncHandler } = require('../middleware/errorHandler');
const { getUserProfile, getUserActivePlan, getUserSessions, getSessionSets, saveNewPlan } = require('../services/firestore');
const router = express.Router();

// Submit a plan regeneration job — delegates to Planning Agent
router.post('/submit', asyncHandler(async (req, res) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Plan regeneration timed out', retryable: true });
    }
  }, 90000);

  try {
    const uid = req.user?.uid;

    // Use request body data if provided, otherwise read from Firestore
    let { userProfile, currentPlan, workoutHistory, schedule } = req.body;

    if (uid && (!userProfile || !currentPlan || !workoutHistory)) {
      const [fsProfile, fsPlan, fsSessions] = await Promise.all([
        !userProfile ? getUserProfile(uid) : null,
        !currentPlan ? getUserActivePlan(uid) : null,
        !workoutHistory ? getUserSessions(uid, { days: 30 }) : null,
      ]);

      if (!userProfile && fsProfile) {
        userProfile = {
          goal: fsProfile.goal,
          equipment: fsProfile.equipment,
          age: fsProfile.age,
          weight_kg: fsProfile.weightKg,
          gender: fsProfile.gender,
        };
      }

      if (!currentPlan && fsPlan) {
        currentPlan = typeof fsPlan.planJson === 'string' ? JSON.parse(fsPlan.planJson) : fsPlan.planJson;
      }

      if (!workoutHistory && fsSessions) {
        workoutHistory = [];
        for (const session of fsSessions) {
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
      }

      if (!schedule && fsProfile) {
        schedule = {
          daysPerWeek: fsProfile.daysPerWeek,
          minutesPerSession: fsProfile.minutesPerSession,
        };
      }
    }

    const result = await handlePlanRegeneration({ userProfile, currentPlan, workoutHistory, schedule });

    // Save new plan to Firestore
    if (uid && result.plan) {
      try {
        await saveNewPlan(uid, result.plan, 'programmer');
      } catch (err) {
        console.error(JSON.stringify({
          severity: 'WARNING',
          message: 'Failed to save regenerated plan to Firestore',
          uid,
          error: err.message,
        }));
      }
    }

    clearTimeout(timeout);
    if (!res.headersSent) {
      res.json({
        state: 'JOB_STATE_SUCCEEDED',
        plan: result.plan,
        changes: result.changes || [],
      });
    }
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}));

module.exports = router;
