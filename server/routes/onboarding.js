const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const { asyncHandler } = require('../middleware/errorHandler');
const { saveNewPlan } = require('../services/firestore');
const router = express.Router();

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

const systemPrompt = `You are Aura's advanced programming engine. Generate a highly effective, dynamic workout plan based on the user's profile, baseline strength assessment, and schedule preferences.

Inputs Provided:
1. User Goal
2. Equipment Context
3. Body Stats (Age, Weight, Gender)
4. Strength Assessment (5 compound lifts with recent weight x reps)
5. Schedule Preferences (days per week, minutes per session)

Requirements:
- Structure a training split matching the user's available training days. Intelligently determine the optimal split (PPL, Upper/Lower, Full Body, etc.) based on available days and goal.

CRITICAL — Starting Weight Calibration:
You MUST calculate a specific numeric targetWeight for EVERY exercise. The targetWeight field MUST be a string containing ONLY a number followed by "kg" — for example "80kg", "12.5kg", "5kg". NEVER put descriptions, instructions, or form cues in targetWeight.

Weight calculation process:
1. Estimate the user's 1RM for each assessed exercise using the Epley formula: 1RM = weight × (1 + reps/30).
2. Use the assessed exercises to infer relative strength for non-assessed exercises (e.g., if bench press 1RM is X, incline press starts at ~85% of X).
3. Apply goal-specific intensity percentages:
   - "Build Muscle" (hypertrophy): Program at 65-75% of estimated 1RM, rep range 8-12
   - "Increase Strength": Program at 80-90% of estimated 1RM, rep range 3-6
   - "Lose Fat": Program at 55-65% of estimated 1RM, rep range 12-15
4. For isolation/accessory exercises, use body weight and gender to estimate appropriate starting weights when no direct assessment exists:
   - Consider the user's compound lift strength ratios to calibrate accessories
   - E.g., if bench 1RM is 80kg, lateral raises likely start at 6-10kg
5. Round all targetWeight values to the nearest 2.5kg (barbell) or 1kg (dumbbell/cable).
6. For bodyweight exercises (pull-ups, dips, push-ups), set targetWeight to "0kg".

VALIDATION: targetWeight MUST match the pattern "<number>kg". Examples: "80kg", "12.5kg", "0kg". NEVER use text descriptions.

- Set rest times (restSeconds) based on exercise type and goal: 60-90s for hypertrophy, 120-180s for strength, 30-60s for endurance/fat loss.
- Adjust exercise count per session to fit within the user's time preference.
- Return strictly a valid JSON array of daily routines.

Output Schema:
[
  {
    "day": "Monday",
    "focus": "Push (Chest, Shoulders, Triceps)",
    "exercises": [
      { "name": "Bench Press", "sets": 3, "reps": "8-10", "targetWeight": "80kg", "restSeconds": 90 }
    ]
  }
]`;

router.post('/', asyncHandler(async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
  }

  const { goal, equipment, baselines, schedule } = req.body;

  const exerciseLines = baselines?.exercises
    ? Object.entries(baselines.exercises)
        .map(([name, data]) => `${name}: ${data.weight}kg x ${data.reps} reps`)
        .join('\n')
    : 'No baseline data provided';

  const daysPerWeek = schedule?.daysPerWeek || 7;
  const minutesPerSession = schedule?.minutesPerSession || 60;

  const promptMessage = `
Goal: ${goal}
Equipment: ${equipment}
Age: ${baselines?.age || 'Unknown'}
Weight: ${baselines?.weight ? baselines.weight + 'kg' : 'Unknown'}
Gender: ${baselines?.gender || 'Unknown'}
Training Days Per Week: ${daysPerWeek}
Minutes Per Session: ${minutesPerSession}

Strength Assessment:
${exerciseLines}

Please generate a ${daysPerWeek}-day workout split in JSON. IMPORTANT: Every exercise must have a numeric targetWeight (e.g. "80kg", "12.5kg") calculated from the strength assessment above. Do NOT use text descriptions in targetWeight. Include restSeconds for each exercise.`;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: promptMessage,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
    },
  });

  const responseText = response.text;
  const plan = JSON.parse(responseText);

  // Validate and normalize targetWeight for every exercise
  if (Array.isArray(plan)) {
    for (const day of plan) {
      if (Array.isArray(day.exercises)) {
        for (const exercise of day.exercises) {
          const raw = exercise.targetWeight;
          if (raw == null || raw === '') {
            console.warn(`[Onboarding] Missing targetWeight for: ${exercise.name}`);
            exercise.targetWeight = '0kg';
          } else if (typeof raw === 'number') {
            exercise.targetWeight = `${raw}kg`;
          } else if (typeof raw === 'string') {
            const numMatch = raw.match(/(\d+\.?\d*)/);
            if (numMatch) {
              exercise.targetWeight = `${parseFloat(numMatch[1])}kg`;
            } else {
              console.warn(`[Onboarding] Non-numeric targetWeight for ${exercise.name}: "${raw}"`);
              exercise.targetWeight = '0kg';
            }
          }

          if (!exercise.restSeconds) {
            exercise.restSeconds = 90;
          }
        }
      }
    }
  }

  // Derive blocks from exercises (all onboarding plans are strength-only)
  if (Array.isArray(plan)) {
    for (const day of plan) {
      if (Array.isArray(day.exercises) && !day.blocks) {
        day.blocks = day.exercises.map((ex, i) => ({
          block_type: 'strength',
          label: ex.name,
          config: {
            exercise: ex.name,
            target_sets: parseInt(ex.sets) || 3,
            target_reps: ex.reps || '8-10',
          },
        }));
      }
    }
  }

  console.log('[Onboarding] Plan generated with', plan.length, 'days,',
    plan.reduce((sum, d) => sum + (d.exercises?.length || 0), 0), 'total exercises');

  // Persist plan to Firestore
  if (req.user?.uid) {
    try {
      await saveNewPlan(req.user.uid, plan, 'onboarding');
    } catch (err) {
      console.error(JSON.stringify({
        severity: 'WARNING',
        message: 'Failed to save plan to Firestore',
        uid: req.user.uid,
        error: err.message,
      }));
      // Non-blocking — client still gets the plan in response
    }
  }

  res.json({ plan });
}));

module.exports = router;
