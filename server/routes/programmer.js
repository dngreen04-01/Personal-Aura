const express = require('express');
const { handlePlanRegeneration } = require('../agents/planning');
const router = express.Router();

// Submit a plan regeneration job — delegates to Planning Agent
router.post('/submit', async (req, res) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Plan regeneration timed out', retryable: true });
    }
  }, 90000);

  try {
    const { userProfile, currentPlan, workoutHistory, schedule } = req.body;

    const result = await handlePlanRegeneration({ userProfile, currentPlan, workoutHistory, schedule });

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
    console.error('Programmer API Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

module.exports = router;
