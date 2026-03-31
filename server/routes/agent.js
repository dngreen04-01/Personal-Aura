const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { routeRequest } = require('../agents/router');
const { generateExerciseDemo, generateFormCheck, generateWorkoutCard } = require('../agents/visual');
const { AGENTS } = require('../agents/types');
const { asyncHandler } = require('../middleware/errorHandler');
const { MINUTES_PER_EXERCISE } = require('../../lib/constants');
const { getWorkoutStreak, getUserProfile } = require('../services/firestore');
const router = express.Router();

// Health check for all agents
router.get('/health', (req, res) => {
  const hasApiKey = !!process.env.GEMINI_API_KEY;
  res.json({
    status: hasApiKey ? 'ok' : 'degraded',
    agents: {
      [AGENTS.orchestrator]: hasApiKey ? 'ok' : 'no_api_key',
      [AGENTS.planning]: hasApiKey ? 'ok' : 'no_api_key',
      [AGENTS.memory]: 'ok',
      [AGENTS.visual]: hasApiKey ? 'ok' : 'no_api_key',
      [AGENTS.motivation]: 'ok',
    },
    timestamp: new Date().toISOString(),
  });
});

router.post('/greet', asyncHandler(async (req, res) => {
  const { userContext } = req.body;
  const { buildGreetingContext } = require('../agents/memory');
  const uid = req.user?.uid;

  // Enrich greeting context with Firestore streak data
  let enrichedContext = { ...userContext };
  if (uid) {
    try {
      const streak = await getWorkoutStreak(uid);
      if (streak.current > 0 || streak.lastWorkoutDate) {
        enrichedContext.streak = streak;
        enrichedContext.lastWorkoutDate = streak.lastWorkoutDate;
      }
    } catch (err) {
      // Non-blocking — fall back to client-provided context
      console.warn('[Agent/greet] Firestore streak lookup failed:', err.message);
    }
  }

  const greetingContext = buildGreetingContext(enrichedContext);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = `You are Aura, a warm and motivating personal training coach. Generate a brief greeting (2-3 sentences) for the user before their workout.

${greetingContext}

Guidelines:
- Reference the time of day naturally
- If they have an active streak, mention it encouragingly (e.g., "3 days strong!")
- If they have recent progress (PRs, volume increases), mention one highlight briefly
- Describe today's scheduled workout specifically: name the focus area, exercise count, and estimated duration (assume ~${MINUTES_PER_EXERCISE} min per exercise including rest periods)
- Ask if they're ready or want to adjust anything (shorter, different focus, etc.)
- Be warm, motivating, and concise — no generic filler`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: 'Generate a greeting for the user before their workout.',
    config: {
      systemInstruction: systemPrompt,
    },
  });

  const text = response.text;
  res.json({ text });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { message, history, userContext } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  // Supplement sparse userContext with Firestore profile data
  let enrichedContext = userContext;
  const uid = req.user?.uid;
  if (uid && (!userContext?.goal || !userContext?.equipment)) {
    try {
      const profile = await getUserProfile(uid);
      if (profile) {
        enrichedContext = {
          goal: profile.goal,
          equipment: profile.equipment,
          experience: profile.experience,
          ...userContext, // Client-provided values take precedence
        };
      }
    } catch (err) {
      console.warn('[Agent] Firestore profile lookup failed:', err.message);
    }
  }

  const result = await routeRequest({ message, history, userContext: enrichedContext });
  res.json(result);
}));

router.post('/image', asyncHandler(async (req, res) => {
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
    throw error;
  }
}));

module.exports = router;
