const { GoogleGenAI } = require('@google/genai');
const { formatTrainingHistory } = require('./memory');

const MODEL_NAME = 'gemini-3.1-pro-preview';

const MUSCLE_TAXONOMY = `Muscle Group Taxonomy:
- Push: Chest (pectoralis major/minor), Anterior Deltoid, Triceps
- Pull: Lats, Rhomboids, Posterior Deltoid, Biceps, Forearms
- Legs: Quadriceps, Hamstrings, Glutes, Calves, Hip Flexors
- Core: Rectus Abdominis, Obliques, Transverse Abdominis, Erector Spinae

Primary/Secondary Movers:
- Bench Press: Primary chest, secondary triceps + anterior deltoid
- Overhead Press: Primary anterior deltoid, secondary triceps + upper chest
- Row: Primary lats + rhomboids, secondary biceps + rear deltoid
- Squat: Primary quads + glutes, secondary hamstrings + core
- Deadlift: Primary glutes + hamstrings, secondary erector spinae + lats`;

const PROGRESSIVE_OVERLOAD_RULES = `Progressive Overload Rules:
- Build Muscle: Push when avg RPE < 7, rep range 8-12
- Increase Strength: Push when avg RPE < 8, rep range 3-6
- Lose Fat: Push conservatively when avg RPE < 6, use half the normal increment (min 1kg), maintain higher rep ranges 12-15
- Plateau Detection: If no weight increase for 6+ sets of an exercise, flag as plateaued and suggest exercise variation or rep scheme change
- RPE Calibration: If average RPE > 9, reduce weight by 5% for recovery

Equipment-Specific Increments (use these when suggesting weight increases):
- Barbell exercises: +2.5kg upper body, +5kg lower body (plate pairs)
- Dumbbell exercises: +2kg per hand
- Cable exercises: +5kg (stack pin increments)
- Machine exercises: +5kg (stack pin increments)`;

const BASE_IDENTITY = `You are Aura's Planning Agent — an exercise physiologist specializing in program design, exercise selection, and biomechanics.

${MUSCLE_TAXONOMY}

${PROGRESSIVE_OVERLOAD_RULES}

Injury Awareness:
- Shoulder impingement: Avoid behind-neck presses, upright rows with narrow grip. Prefer neutral grip pressing, landmine press, cable lateral raises.
- Lower back: Avoid heavy conventional deadlifts if compromised. Prefer trap bar deadlifts, hip thrusts, Romanian deadlifts with controlled load.
- Knee: Avoid deep squats under heavy load. Prefer leg press with limited ROM, step-ups, wall sits.
- Wrist: Avoid barbell curls. Prefer EZ bar, dumbbells, or hammer grip variations.

Keep your "text" field brief — 1-2 sentences appropriate for a mid-workout context. The JSON data carries the detail.`;

/**
 * Build the structured prompt section from agent context.
 */
function buildPlanningPrompt(message, agentContext) {
  const { user, workout, location, progression } = agentContext;

  const parts = [`User Message: "${message}"`];

  if (workout.currentExercise) parts.push(`Current Exercise: ${workout.currentExercise}`);
  if (user.goal) parts.push(`User Goal: ${user.goal}`);
  if (user.equipment) parts.push(`Available Equipment: ${user.equipment}`);
  if (location?.name) parts.push(`Location: ${location.name}`);
  if (location?.equipmentList) {
    const eqList = Array.isArray(location.equipmentList) ? location.equipmentList.join(', ') : location.equipmentList;
    parts.push(`Location Equipment: ${eqList}`);
  }
  if (workout.currentWeight) parts.push(`Current Weight: ${workout.currentWeight}${user.weightUnit || 'kg'}`);
  if (workout.currentSet) parts.push(`Current Set: ${workout.currentSet}${workout.totalSets ? '/' + workout.totalSets : ''}`);
  if (workout.targetReps) parts.push(`Target Reps: ${workout.targetReps}`);
  if (workout.day) parts.push(`Today's Focus: ${workout.day}`);

  if (progression) {
    if (progression.avgRpe != null) parts.push(`Avg RPE: ${progression.avgRpe}`);
    if (progression.suggestedWeight) parts.push(`Suggested Weight: ${progression.suggestedWeight}${user.weightUnit || 'kg'}`);
    if (progression.isPlateaued) parts.push(`Plateaued: Yes`);
    if (progression.pushReason) parts.push(`Push Reason: ${progression.pushReason}`);
    if (progression.rpeTrend) parts.push(`RPE Trend: ${progression.rpeTrend}`);
  }

  // Append training history if available
  const historyBlock = formatTrainingHistory(agentContext);
  if (historyBlock) parts.push(historyBlock);

  return parts.join('\n');
}

/**
 * Handle exercise swap requests with biomechanical reasoning.
 * Returns the same swapSuggestion shape as orchestrator for backward compatibility.
 */
async function handleSwapRequest(message, agentContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const systemPrompt = `${BASE_IDENTITY}

Your task: Suggest 3 alternative exercises when the user wants to swap an exercise.

For each alternative, provide a biomechanical description explaining WHY it's a good substitute — mention the target muscles, movement pattern, and any injury/equipment considerations. Mark the single best overall alternative as recommended.

Equipment awareness: Only suggest exercises the user can perform with their available equipment.
Use exact exercise names from the database. Do not abbreviate or alter exercise names.

You MUST respond with valid JSON matching this exact schema:
{
  "text": "Brief 1-2 sentence message to the user",
  "swapSuggestion": {
    "original_exercise": "Name of exercise being swapped",
    "reason": "Why the user wants to swap",
    "alternatives": [
      {
        "name": "Alternative exercise name",
        "description": "Biomechanical reasoning — target muscles, movement pattern, benefits",
        "is_recommended": true or false
      }
    ]
  }
}`;

  const userPrompt = buildPlanningPrompt(message, agentContext);

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
    },
  });

  return JSON.parse(response.text);
}

/**
 * Handle broader plan modification requests.
 * e.g. "make today lighter", "I'm at home, modify workout"
 * Delegates to handleWorkoutModification so the response includes a workoutCard
 * (which the frontend renders) instead of planModification (which it ignores).
 */
async function handlePlanModification(message, agentContext) {
  return handleWorkoutModification(message, agentContext);
}

/**
 * Handle progressive overload queries.
 * e.g. "should I go heavier on bench?"
 */
async function handleProgressiveOverload(message, agentContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const systemPrompt = `${BASE_IDENTITY}

Your task: Advise the user on weight progression for their current exercise based on their RPE data, goal, and progression history.

Apply the progressive overload rules strictly. If the user isn't ready to increase, explain why and what they should aim for first.

You MUST respond with valid JSON matching this exact schema:
{
  "text": "Brief 1-2 sentence message to the user",
  "overloadSuggestion": {
    "exercise": "Exercise name",
    "currentWeight": 80,
    "suggestedWeight": 82.5,
    "weightUnit": "kg",
    "reason": "Why this progression is appropriate — RPE data, goal alignment, readiness indicators"
  }
}`;

  const userPrompt = buildPlanningPrompt(message, agentContext);

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
    },
  });

  return JSON.parse(response.text);
}

/**
 * Handle workout modification or replacement requests.
 * Supports two call shapes:
 *   - From router: argsOrMessage is a string (user's message)
 *   - From orchestrator: argsOrMessage is an object with modification_type
 */
async function handleWorkoutModification(argsOrMessage, agentContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const isFromOrchestrator = typeof argsOrMessage === 'object' && argsOrMessage.modification_type;

  let modificationType, instructions, currentExercises;

  if (isFromOrchestrator) {
    modificationType = argsOrMessage.modification_type;
    instructions = argsOrMessage.instructions;
    currentExercises = argsOrMessage.current_exercises || agentContext.workout?.exercises || [];
  } else {
    // From router — argsOrMessage is the user's message string
    instructions = typeof argsOrMessage === 'string' ? argsOrMessage : argsOrMessage.message || '';
    currentExercises = agentContext.workout?.exercises || [];
    // Determine type: custom/new workout creation → replace, tweaks → adjust
    const lowerInst = instructions.toLowerCase();
    const isReplacement = ['completely different', 'something else', 'custom workout',
      'make me a', 'build me a', 'new workout', 'make a workout',
      'want to do', 'rather do', 'instead do'].some(k => lowerInst.includes(k));
    modificationType = isReplacement ? 'replace' : 'adjust';
  }

  const contextBlock = agentContext.workout ?
    `Current workout: ${agentContext.workout.day || 'General'}\nExercises: ${JSON.stringify(currentExercises)}` : '';

  const userStats = [
    agentContext.user?.weightKg ? `User weighs ${agentContext.user.weightKg}kg` : null,
    agentContext.user?.gender ? `Gender: ${agentContext.user.gender}` : null,
    agentContext.user?.age ? `Age: ${agentContext.user.age}` : null,
  ].filter(Boolean).join(', ');

  // Build training history context
  const trainingHistoryBlock = formatTrainingHistory(agentContext);

  const systemPrompt = `${BASE_IDENTITY}

Your task: ${modificationType === 'replace'
    ? 'Generate a completely new workout session based on the user\'s request. Ignore the current workout plan entirely.'
    : 'Modify the current workout based on user constraints. Keep the same general focus but adjust as requested.'}

User's equipment: ${agentContext.user?.equipment || 'full gym'}
User's goal: ${agentContext.user?.goal || 'general fitness'}
${userStats ? `User stats: ${userStats}` : ''}
${contextBlock}
${trainingHistoryBlock}

User's request: ${instructions}

Training History Guardrails:
- ALWAYS check the Recent Training History before selecting exercises.
- Do NOT include exercises that target a muscle group trained in the last 48 hours, unless the user explicitly requests it.
- When the user's recent training shows a muscle group gap (not trained in 5+ days), prefer exercises that fill that gap.
- In your "text" response, briefly mention what was recently trained. Example: "Since you hit chest and shoulders yesterday, I'm focusing today on back and biceps."
${modificationType === 'replace' ? '- This is a ONE-OFF session, not part of the training program. Include this note in your text response: mention that their regular program resumes tomorrow.' : ''}

Weight Rules:
- Every exercise MUST have a specific numeric targetWeight in kg (e.g. "40kg"). Never use null or omit it.
- If the user has logged the exercise before (check Recent Exercise Weights above), use their actual weight history to set an appropriate target. Set "isEstimated": false for these.
- For exercises the user has NOT done before: estimate based on body weight ratios and performance on similar movements. Set "isEstimated": true.
- For bodyweight exercises (push-ups, pull-ups, etc.): use "0kg".
- Round to nearest 2.5kg for barbell, nearest 2kg for dumbbell, nearest 5kg for cable/machine.

Block type reference (all 9 canonical types):
- "strength": config: { exercise, target_sets, target_reps }
- "interval": config: { work_sec, rest_sec, rounds }
- "amrap": config: { time_cap_sec, movements: [{ name, reps? }] }
- "emom": config: { minutes, movements: [{ name, reps? }] }
- "circuit": config: { stations: [{ name, reps?, duration_sec? }], rounds }
- "timed": config: { duration_sec }
- "distance": config: { target_distance_m }
- "cardio": config: { modality, duration_sec?, target_distance_m? }
- "rest": config: { duration_sec }

You MUST respond with valid JSON matching this exact schema:
{
  "text": "Brief confirmation message referencing recent training (1-2 sentences)",
  "workoutCard": {
    "focus": "Updated focus label",
    "blocks": [
      { "block_type": "strength", "label": "Exercise Name", "config": { "exercise": "Exercise Name", "target_sets": 3, "target_reps": "8-10" } }
    ],
    "exercises": [{ "name": "Exercise Name", "sets": 3, "reps": "8-10", "targetWeight": "40kg", "isEstimated": false, "restSeconds": 90 }],
    "estimatedDuration": 45,
    "modificationType": "${modificationType}"
  }
}`;

  const userPrompt = `${instructions}\n\n${contextBlock}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text);
    return {
      text: parsed.text,
      workoutCard: parsed.workoutCard,
    };
  } catch (error) {
    console.error('Workout modification error:', error);
    return {
      text: "I had trouble modifying the workout. Let me know what you'd like to change and I'll try again.",
      workoutCard: null,
    };
  }
}

/**
 * Handle full plan regeneration (called by programmer route).
 * Analyzes workout history and generates an updated plan with progressive overload.
 */
async function handlePlanRegeneration({ userProfile, currentPlan, workoutHistory, schedule }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const systemPrompt = `${BASE_IDENTITY}

Your task: Analyze the user's workout history (up to 30 days) and current plan, then generate an updated plan that applies progressive overload and addresses plateaus.

Analysis Framework:
${PROGRESSIVE_OVERLOAD_RULES}
- Volume Adjustment: If user consistently completes all sets with low RPE, consider adding a set. If failing sets, reduce.
- Schedule Respect: Keep the same number of training days and time constraints.
- Weight Specificity: Every exercise in the updated plan MUST have a specific numeric targetWeight. Use the workout history to calculate appropriate weights — never leave weights vague.
- Strength Transfer: For exercises the user has NOT performed yet (not in workout history), estimate appropriate weights based on:
  1. Their performance on similar exercises (same muscle group, similar movement pattern)
  2. Standard strength ratios (e.g., incline press ≈ 85-90% of flat bench, leg curl ≈ 50% of squat)
  3. Body weight and gender for reference
  Mark these estimated exercises with "isEstimated": true so the frontend can indicate they are estimates. Exercises with history-based weights should NOT have this flag.

You MUST respond with valid JSON matching this exact schema:
{
  "plan": [
    {
      "day": "Monday",
      "focus": "Push (Chest, Shoulders, Triceps)",
      "blocks": [
        { "block_type": "strength", "label": "Bench Press", "config": { "exercise": "Bench Press", "target_sets": 3, "target_reps": "8-10" } },
        { "block_type": "strength", "label": "Incline Dumbbell Press", "config": { "exercise": "Incline Dumbbell Press", "target_sets": 3, "target_reps": "10-12" } }
      ],
      "exercises": [
        { "name": "Bench Press", "sets": 3, "reps": "8-10", "targetWeight": "82.5kg", "restSeconds": 90 },
        { "name": "Incline Dumbbell Press", "sets": 3, "reps": "10-12", "targetWeight": "30kg", "isEstimated": true, "restSeconds": 90 }
      ]
    }
  ],
  "changes": [
    "Bench Press: Weight increased from 80kg to 82.5kg (avg RPE 6.5, consistently hitting 10 reps)"
  ]
}

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

For pure strength programs, every exercise becomes a strength block. For mixed programs (HIIT, conditioning, Hyrox, sport-specific), use the appropriate block type.
The "exercises" array MUST contain one entry per strength block for backward compatibility.`;

  const prompt = `User Profile:
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

Analyze the workout history, detect plateaus, apply progressive overload based on RPE data, and generate an updated plan.`;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
    },
  });

  return JSON.parse(response.text);
}

module.exports = { handleSwapRequest, handlePlanModification, handleProgressiveOverload, handleWorkoutModification, handlePlanRegeneration };
