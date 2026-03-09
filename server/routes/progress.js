const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const router = express.Router();

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

const systemPrompt = `You are Aura, an elite fitness AI. Generate ONE short motivating insight (1-2 sentences) based on the user's recent workout stats. Be specific with numbers from the data provided. Keep it punchy and encouraging.`;

router.post('/insights', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
    }

    const { recentStats } = req.body;

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
  } catch (error) {
    console.error('Progress Insights Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
