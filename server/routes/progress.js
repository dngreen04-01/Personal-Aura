const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { asyncHandler } = require('../middleware/errorHandler');
const { getUserSessions, getSessionSets } = require('../services/firestore');
const router = express.Router();

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

const systemPrompt = `You are Aura, an elite fitness AI. Generate ONE short motivating insight (1-2 sentences) based on the user's recent workout stats. Be specific with numbers from the data provided. Keep it punchy and encouraging.`;

router.post('/insights', asyncHandler(async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
  }

  let recentStats = req.body.recentStats;

  // If no stats from client, compute from Firestore
  if (!recentStats && req.user?.uid) {
    const sessions = await getUserSessions(req.user.uid, { days: 7 });
    if (sessions.length > 0) {
      let totalVolume = 0;
      let totalSets = 0;
      const exerciseMaxes = {};

      for (const session of sessions) {
        const sets = await getSessionSets(req.user.uid, session.id);
        for (const set of sets) {
          const weight = set.weight || 0;
          const reps = set.reps || 0;
          totalVolume += weight * reps;
          totalSets++;

          const name = set.exerciseName;
          if (name && weight > (exerciseMaxes[name] || 0)) {
            exerciseMaxes[name] = weight;
          }
        }
      }

      recentStats = {
        sessionCount: sessions.length,
        totalVolume: Math.round(totalVolume),
        totalSets,
        prs: Object.entries(exerciseMaxes).map(([name, weight]) => ({
          exercise: name,
          weight,
        })),
      };
    }
  }

  if (!recentStats) {
    return res.json({ insight: 'Start your first workout to get personalized insights!' });
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Here are the user's recent workout stats:\n${JSON.stringify(recentStats, null, 2)}\n\nGenerate a short motivating insight.`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction: systemPrompt,
    },
  });

  const text = response.text;

  res.json({ insight: text });
}));

module.exports = router;
