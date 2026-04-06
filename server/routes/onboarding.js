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

// --- Phase 4: Conversational goal elicitation endpoint ---

router.post('/elicit', asyncHandler(async (req, res) => {
  const { handleElicitationTurn } = require('../agents/elicitation');
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  // Truncate history to prevent unbounded payloads and cost amplification
  const truncatedHistory = Array.isArray(history) ? history.slice(-20) : [];

  const result = await handleElicitationTurn(message, truncatedHistory);

  // Server-side guard: reject extraction if fewer than 3 conversational turns
  const userTurnCount = truncatedHistory.filter(h => h.role === 'user').length;
  if (result.isComplete && userTurnCount < 2) {
    // LLM tried to extract too early — force it to keep asking
    res.json({ text: result.text, extractedData: null, isComplete: false });
    return;
  }

  res.json(result);
}));

// --- Phase 4: Multi-modality plan generation endpoint ---

router.post('/generate', asyncHandler(async (req, res) => {
  const { validateBlockPlan } = require('../../lib/validateBlockPlan');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
  }

  const { goals, injuries, sport_context, style_preferences, equipment, bodyStats, schedule, baselines } = req.body;

  const primaryGoal = goals?.primary || 'general_health';
  const modalities = goals?.modalities || ['strength'];
  const style = goals?.style || 'moderate_volume';

  const exerciseLines = baselines?.exercises
    ? Object.entries(baselines.exercises)
        .map(([name, data]) => `${name}: ${data.weight}kg x ${data.reps} reps`)
        .join('\n')
    : 'No baseline data provided';

  const daysPerWeek = schedule?.daysPerWeek || 4;
  const minutesPerSession = schedule?.minutesPerSession || 60;

  const injuryBlock = injuries && injuries.length > 0
    ? `\nInjuries/Limitations:\n${injuries.map(i => `- ${i.area}${i.severity ? ` (${i.severity})` : ''}${i.notes ? `: ${i.notes}` : ''}`).join('\n')}`
    : '';

  const sportBlock = sport_context?.sport
    ? `\nSport Context: ${sport_context.sport}${sport_context.competition_focus ? ' (competition training)' : ''}${sport_context.season_phase ? `, phase: ${sport_context.season_phase}` : ''}`
    : '';

  const styleBlock = style_preferences
    ? `\nStyle Preferences: ${style_preferences.preferred_session_feel || 'balanced'}${style_preferences.dislikes?.length ? `, dislikes: ${style_preferences.dislikes.join(', ')}` : ''}${style_preferences.variety_preference ? `, variety: ${style_preferences.variety_preference}` : ''}`
    : '';

  const generateSystemPrompt = `You are Aura's advanced programming engine. Generate a highly effective workout plan that matches the user's goals, modalities, and preferences.

Primary Goal: ${primaryGoal}
Training Modalities: ${modalities.join(', ')}
Training Style: ${style}
Equipment: ${equipment || 'full gym'}${injuryBlock}${sportBlock}${styleBlock}

Requirements:
- Structure a ${daysPerWeek}-day training split matching the user's available days and goals.
- Use the appropriate block types for the user's modalities. Do NOT default everything to strength blocks.
- For strength-focused goals: use strength blocks for compound and isolation exercises.
- For conditioning/HIIT: use interval, circuit, or amrap blocks.
- For sport-specific (e.g. Hyrox): mix strength, distance, circuit, and cardio blocks.
- For endurance: use cardio and distance blocks alongside supporting strength work.
- Include rest blocks between high-intensity segments when appropriate (60-120s).

CRITICAL — Starting Weight Calibration (for strength blocks only):
You MUST calculate a specific numeric targetWeight for EVERY strength exercise.
The targetWeight field MUST be a string containing ONLY a number followed by "kg" — e.g. "80kg", "12.5kg", "0kg".
Use the Epley formula (1RM = weight × (1 + reps/30)) from baseline data to estimate starting weights.
For bodyweight exercises, use "0kg".

${injuries?.length ? `INJURY AWARENESS: Avoid exercises that stress: ${injuries.map(i => i.area).join(', ')}. Suggest alternative movements that work around these limitations.` : ''}

Block type reference (all 9 canonical types):
- "strength": weight-based exercise. config: { exercise (string), target_sets (integer >= 1), target_reps (string or integer) }
- "interval": work/rest cycles. config: { work_sec (integer > 0), rest_sec (integer >= 0), rounds (integer >= 1) }
- "amrap": as many rounds as possible. config: { time_cap_sec (integer > 0), movements: [{ name (string), reps (integer, optional) }] }
- "emom": every minute on the minute. config: { minutes (integer >= 1), movements: [{ name (string), reps (integer, optional) }] }
- "circuit": station-based circuit. config: { stations: [{ name (string), reps (integer, optional), duration_sec (integer, optional) }], rounds (integer >= 1) }
- "timed": simple timed hold/effort. config: { duration_sec (integer > 0) }
- "distance": distance target. config: { target_distance_m (integer > 0) }
- "cardio": cardio modality. config: { modality (string: run/row/bike/ski/swim), duration_sec (integer > 0, optional), target_distance_m (integer > 0, optional) } — at least one metric required
- "rest": recovery block. config: { duration_sec (integer > 0) }

Output Schema:
[
  {
    "day": "Monday",
    "focus": "Strength + Conditioning",
    "blocks": [
      { "block_type": "strength", "label": "Bench Press", "config": { "exercise": "Bench Press", "target_sets": 3, "target_reps": "8-10" } },
      { "block_type": "interval", "label": "Tabata Finisher", "config": { "work_sec": 20, "rest_sec": 10, "rounds": 8 } }
    ],
    "exercises": [
      { "name": "Bench Press", "sets": 3, "reps": "8-10", "targetWeight": "80kg", "restSeconds": 90 }
    ]
  }
]

The "exercises" array MUST contain one entry per strength block for backward compatibility. Non-strength blocks do not need entries in the "exercises" array.`;

  const promptMessage = `
Goal: ${primaryGoal} (modalities: ${modalities.join(', ')})
Equipment: ${equipment || 'full gym'}
Age: ${bodyStats?.age || 'Unknown'}
Weight: ${bodyStats?.weight ? bodyStats.weight + 'kg' : 'Unknown'}
Gender: ${bodyStats?.gender || 'Unknown'}
Training Days Per Week: ${daysPerWeek}
Minutes Per Session: ${minutesPerSession}

Strength Assessment:
${exerciseLines}

Please generate a ${daysPerWeek}-day workout split in JSON. Use varied block types matching the user's modalities (${modalities.join(', ')}). Every strength exercise must have a numeric targetWeight.`;

  const ai = new GoogleGenAI({ apiKey });
  let plan;
  let retries = 0;
  const MAX_RETRIES = 2;

  while (retries <= MAX_RETRIES) {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: promptMessage,
      config: {
        systemInstruction: generateSystemPrompt,
        responseMimeType: 'application/json',
      },
    });

    try {
      plan = JSON.parse(response.text);
    } catch (parseErr) {
      console.error(JSON.stringify({
        severity: 'WARNING',
        message: 'Gemini returned invalid JSON in multi-modality generation',
        attempt: retries + 1,
      }));
      retries++;
      if (retries > MAX_RETRIES) {
        return res.status(502).json({ error: 'Plan generation failed — invalid AI response' });
      }
      continue;
    }
    if (!Array.isArray(plan)) {
      plan = plan.plan || [];
    }

    // Validate and normalize
    let allValid = true;
    for (const day of plan) {
      // Normalize targetWeight for strength exercises
      if (Array.isArray(day.exercises)) {
        for (const exercise of day.exercises) {
          const raw = exercise.targetWeight;
          if (raw == null || raw === '') {
            exercise.targetWeight = '0kg';
          } else if (typeof raw === 'number') {
            exercise.targetWeight = `${raw}kg`;
          } else if (typeof raw === 'string') {
            const numMatch = raw.match(/(\d+\.?\d*)/);
            exercise.targetWeight = numMatch ? `${parseFloat(numMatch[1])}kg` : '0kg';
          }
          if (!exercise.restSeconds) exercise.restSeconds = 90;
        }
      }

      // Validate blocks
      if (day.blocks && day.blocks.length > 0) {
        const validation = validateBlockPlan({ blocks: day.blocks });
        if (!validation.valid) {
          console.error(JSON.stringify({
            severity: 'WARNING',
            message: 'Block validation failed in multi-modality generation',
            day: day.day,
            errors: validation.errors,
            attempt: retries + 1,
          }));
          allValid = false;
          break;
        }
        day.blocks = validation.normalized.blocks;
      }

      // Derive exercises from strength blocks if missing
      if (day.blocks && (!day.exercises || day.exercises.length === 0)) {
        day.exercises = day.blocks
          .filter(b => b.block_type === 'strength')
          .map(b => ({
            name: b.config.exercise || b.label,
            sets: b.config.target_sets || 3,
            reps: b.config.target_reps || '8-10',
            targetWeight: b.config.target_weight || '0kg',
            restSeconds: 90,
          }));
      }

      // Derive blocks from exercises if blocks missing
      if (!day.blocks && Array.isArray(day.exercises)) {
        day.blocks = day.exercises.map((ex) => ({
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

    if (allValid) break;
    retries++;
    if (retries > MAX_RETRIES) {
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: 'Block validation failed after max retries in generate, stripping invalid blocks',
      }));
      for (const day of plan) {
        if (day.blocks) delete day.blocks;
      }
      break;
    }
  }

  console.log('[Onboarding/Generate] Plan generated with', plan.length, 'days,',
    plan.reduce((sum, d) => sum + (d.blocks?.length || 0), 0), 'total blocks');

  // Persist to Firestore
  if (req.user?.uid) {
    try {
      await saveNewPlan(req.user.uid, plan, 'onboarding_v2');
    } catch (err) {
      console.error(JSON.stringify({
        severity: 'WARNING',
        message: 'Failed to save multi-modality plan to Firestore',
        uid: req.user.uid,
        error: err.message,
      }));
    }
  }

  res.json({ plan });
}));

module.exports = router;
