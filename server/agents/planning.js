const { GoogleGenAI } = require('@google/genai');

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
- Build Muscle: Push when avg RPE < 7, increase by 2.5kg (upper) or 5kg (lower), rep range 8-12
- Increase Strength: Push when avg RPE < 8, increase by 2.5kg (upper) or 5kg (lower), rep range 3-6
- Lose Fat: Push conservatively when avg RPE < 6, increase by 1-2.5kg, maintain higher rep ranges 12-15
- Plateau Detection: If no weight increase for 6+ sets of an exercise, flag as plateaued and suggest exercise variation or rep scheme change
- RPE Calibration: If average RPE > 9, reduce weight by 5% for recovery`;

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
 */
async function handlePlanModification(message, agentContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const systemPrompt = `${BASE_IDENTITY}

Your task: Modify the user's workout plan based on their request (e.g. make it lighter/harder, adapt for different equipment or location).

For each exercise modification, explain the reasoning — why the replacement targets the same muscle groups and suits the user's current constraints.

Equipment awareness: Only suggest exercises the user can perform with their available equipment.

You MUST respond with valid JSON matching this exact schema:
{
  "text": "Brief 1-2 sentence message to the user",
  "planModification": {
    "modifiedExercises": [
      {
        "original": "Original exercise name",
        "replacement": "Replacement exercise name",
        "reason": "Why this replacement works — muscles targeted, equipment needed, intensity adjustment"
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
    // Determine type from context
    modificationType = instructions.toLowerCase().includes('completely different') ||
                       instructions.toLowerCase().includes('something else') ? 'replace' : 'adjust';
  }

  const contextBlock = agentContext.workout ?
    `Current workout: ${agentContext.workout.day || 'General'}\nExercises: ${JSON.stringify(currentExercises)}` : '';

  const systemPrompt = `${BASE_IDENTITY}

Your task: ${modificationType === 'replace'
    ? 'Generate a completely new workout session based on the user\'s request. Ignore the current workout plan entirely.'
    : 'Modify the current workout based on user constraints. Keep the same general focus but adjust as requested.'}

User's equipment: ${agentContext.user?.equipment || 'full gym'}
User's goal: ${agentContext.user?.goal || 'general fitness'}
${contextBlock}

User's request: ${instructions}

You MUST respond with valid JSON matching this exact schema:
{
  "text": "Brief confirmation message (1-2 sentences)",
  "workoutCard": {
    "focus": "Updated focus label",
    "exercises": [{ "name": "Exercise Name", "sets": 3, "reps": "8-10", "targetWeight": null, "restSeconds": 90 }],
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

You MUST respond with valid JSON matching this exact schema:
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
    "Bench Press: Weight increased from 80kg to 82.5kg (avg RPE 6.5, consistently hitting 10 reps)"
  ]
}`;

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
