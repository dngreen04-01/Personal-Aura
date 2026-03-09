const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const router = express.Router();

const MODEL_NAME = 'gemini-2.5-pro';

const systemPrompt = `You are Aura's Programmer engine — the async intelligence layer responsible for adaptive plan regeneration.

Analyze the user's workout history (up to 30 days) and current plan, then generate an updated plan that applies progressive overload and addresses plateaus.

Analysis Framework:
1. Progressive Overload (Goal-Aware):
   - "Build Muscle": Push when avg RPE < 7, increase by 2.5kg (upper) or 5kg (lower), rep range 8-12
   - "Increase Strength": Push when avg RPE < 8, increase by 2.5kg (upper) or 5kg (lower), rep range 3-6
   - "Lose Fat": Push conservatively when avg RPE < 6, increase by 1-2.5kg, maintain higher rep ranges 12-15
2. Plateau Detection: If no weight increase for 6+ sets of an exercise, flag as plateaued and suggest exercise variation or rep scheme change.
3. RPE Calibration: If average RPE > 9 (strength) / > 9 (hypertrophy) / > 8.5 (fat loss), reduce weight by 5% for recovery.
4. Volume Adjustment: If user consistently completes all sets with low RPE, consider adding a set. If failing sets, reduce.
5. Schedule Respect: Keep the same number of training days and time constraints.
6. Weight Specificity: Every exercise in the updated plan MUST have a specific numeric targetWeight. Use the workout history to calculate appropriate weights — never leave weights vague.

Output Requirements:
- Return a JSON object with "plan" (the updated plan array) and "changes" (array of human-readable change descriptions).
- The plan array follows the same schema as the original plan.
- Each change description should explain what changed and why.

Output Schema:
{
  "plan": [
    {
      "day": "Monday",
      "focus": "Push (Chest, Shoulders, Triceps)",
      "exercises": [
        { "name": "Bench Press", "sets": 3, "reps": "8-10", "targetWeight": "82.5kg", "restSeconds": 90 }
      ]
    }
  ],
  "changes": [
    "Bench Press: Weight increased from 80kg to 82.5kg (avg RPE 6.5, consistently hitting 10 reps)",
    "Lateral Raise: Added 1 extra set (completing all sets with RPE < 6)"
  ]
}`;

// Submit a plan regeneration batch job
router.post('/submit', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
    }

    const { userProfile, currentPlan, workoutHistory, schedule } = req.body;

    const prompt = `
User Profile:
- Goal: ${userProfile?.goal || 'Unknown'}
- Equipment: ${userProfile?.equipment || 'Unknown'}
- Age: ${userProfile?.age || 'Unknown'}
- Weight: ${userProfile?.weight_kg ? userProfile.weight_kg + 'kg' : 'Unknown'}
- Gender: ${userProfile?.gender || 'Unknown'}

Schedule:
- Days Per Week: ${schedule?.daysPerWeek || currentPlan?.length || 7}
- Minutes Per Session: ${schedule?.minutesPerSession || 60}

Current Plan:
${JSON.stringify(currentPlan, null, 2)}

Workout History (Last 30 Days):
${JSON.stringify(workoutHistory, null, 2)}

Analyze the workout history, detect plateaus, apply progressive overload based on RPE data, and generate an updated plan. Return JSON with "plan" and "changes" arrays.`;

    const ai = new GoogleGenAI({ apiKey });

    // Use standard API call (Batch API requires server-side file storage which
    // adds complexity — using standard call with Pro model for quality)
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });

    const result = JSON.parse(response.text);

    res.json({
      state: 'JOB_STATE_SUCCEEDED',
      plan: result.plan,
      changes: result.changes || [],
    });
  } catch (error) {
    console.error('Programmer API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
