const express = require('express');
const { routeRequest } = require('../agents/router');
const { generateExerciseDemo, generateFormCheck, generateWorkoutCard } = require('../agents/visual');
const { AGENTS } = require('../agents/types');
const router = express.Router();

// Health check for all agents
router.get('/health', (req, res) => {
  const hasApiKey = !!process.env.GEMINI_API_KEY;
  res.json({
    status: hasApiKey ? 'ok' : 'degraded',
    agents: {
      [AGENTS.orchestrator]: hasApiKey ? 'ok' : 'no_api_key',
      [AGENTS.planning]: hasApiKey ? 'ok' : 'no_api_key',
      [AGENTS.memory]: 'ok',  // deterministic, no external deps
      [AGENTS.visual]: hasApiKey ? 'ok' : 'no_api_key',
      [AGENTS.motivation]: 'ok',  // deterministic, no external deps
    },
    timestamp: new Date().toISOString(),
  });
});

router.post('/', async (req, res) => {
  try {
    const { message, history, userContext } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const result = await routeRequest({ message, history, userContext });
    res.json(result);
  } catch (error) {
    console.error('Agent API Error:', error);
    const isTimeout = error.message?.includes('timed out');
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Request timed out. Please try again.' : error.message,
      retryable: isTimeout,
    });
  }
});

router.post('/image', async (req, res) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Image generation timed out' });
    }
  }, 30000);

  try {
    const { type, exercise, equipment, modification, userDescription, sessionStats } = req.body;

    let result;
    switch (type) {
      case 'exercise_demo':
        result = await generateExerciseDemo(exercise, equipment, modification);
        break;
      case 'form_check':
        result = await generateFormCheck(exercise, userDescription);
        break;
      case 'workout_card':
        result = await generateWorkoutCard(sessionStats);
        break;
      default:
        clearTimeout(timeout);
        return res.status(400).json({ error: `Unknown image type: ${type}` });
    }

    clearTimeout(timeout);
    if (!res.headersSent) {
      res.json(result);
    }
  } catch (error) {
    clearTimeout(timeout);
    console.error('Visual Agent Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

module.exports = router;
