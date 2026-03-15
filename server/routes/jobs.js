const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { runStreakChecker } = require('../jobs/streakChecker');
const { runProgressAnalyzer } = require('../jobs/progressAnalyzer');
const { runPlanAdjuster } = require('../jobs/planAdjuster');
const router = express.Router();

// Job auth middleware — validates API key from Cloud Scheduler
function jobAuthMiddleware(req, res, next) {
  const jobsKey = process.env.JOBS_API_KEY;
  if (!jobsKey) {
    return res.status(500).json({ error: 'JOBS_API_KEY not configured' });
  }

  const providedKey = req.headers['x-jobs-key'];
  if (providedKey !== jobsKey) {
    return res.status(401).json({ error: 'Invalid job API key' });
  }

  next();
}

router.use(jobAuthMiddleware);

router.post('/streak-checker', asyncHandler(async (req, res) => {
  const result = await runStreakChecker();
  res.json({ status: 'completed', ...result });
}));

router.post('/progress-analyzer', asyncHandler(async (req, res) => {
  const result = await runProgressAnalyzer();
  res.json({ status: 'completed', ...result });
}));

router.post('/plan-adjuster', asyncHandler(async (req, res) => {
  const result = await runPlanAdjuster();
  res.json({ status: 'completed', ...result });
}));

module.exports = router;
