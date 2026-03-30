const { GoogleGenAI } = require('@google/genai');
const { buildAgentContext, formatContextBlock, formatCompletionDirective, formatTrainingHistory } = require('./memory');
const { evaluateSet } = require('./motivation');
const { TIMEOUTS, withTimeout } = require('./types');

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

function buildSystemPrompt(agentContext) {
  const contextBlock = formatContextBlock(agentContext);
  const completionDirective = formatCompletionDirective(agentContext);
  const trainingHistoryBlock = formatTrainingHistory(agentContext);

  const isPreWorkout = !agentContext.workout.sessionId;

  if (isPreWorkout) {
    return `You are Aura, a warm and motivating personal training agent. You are chatting with the user BEFORE their workout.
${contextBlock}${trainingHistoryBlock}
Your Core Directives:
1. Be conversational and warm. 2-3 sentences. Ask questions, acknowledge preferences.
2. When the user is ready to start, confirm and present the workout.
3. When the user wants modifications (shorter, different focus, injury, fatigue), call modify_workout with type "adjust".
4. When the user wants something completely different, call modify_workout with type "replace".
5. Exercise Swaps: Same as mid-workout — call suggest_swap with 3 alternatives. Provide 3 alternatives that target the same muscle groups. Mark the best overall alternative as recommended. Include a brief reason for each suggestion. Use exact exercise names from the exercise database when suggesting alternatives.
6. Training Awareness: You have the user's recent training history above. When discussing today's workout or suggesting changes, reference what they trained recently. Example: "You hit legs hard yesterday, so today's upper body focus is good timing." If the user asks for a replacement workout, steer them toward muscle groups that haven't been trained recently. If they insist on repeating a recently trained muscle group, respect their choice but mention it.

Tone: Friendly, supportive, conversational.`;
  }

  return `You are Aura, an elite, highly motivating personal training agent. You are currently speaking with the user during their workout.
${contextBlock}${trainingHistoryBlock}${completionDirective}
Your Core Directives:
1. Brevity: The user is mid-workout. Keep responses to 1-2 short sentences. Do not use fluff.
2. Motivation: Acknowledge their effort. If they hit a personal best, celebrate it.
3. Data Parsing: When the user logs a set, you MUST trigger the log_set function.
4. Rest Timers: After every logged set, automatically determine the optimal rest time and trigger the log_set function with recommended_rest_seconds. Use these guidelines: 60-90s for hypertrophy, 120-180s for strength, 30-60s for endurance.
5. Exercise Swaps: When a user asks to swap, replace, or find an alternative for an exercise (due to equipment unavailability, injury, preference, etc.), you MUST call the suggest_swap function. Provide 3 alternatives that target the same muscle groups. Mark the best overall alternative as recommended. Include a brief reason for each suggestion (e.g. "Better stabilization required", "Maximum isolation", "High tricep activation"). Use exact exercise names from the exercise database when suggesting alternatives.
6. Weight Progression: After a set is logged, the Motivation Engine provides coaching tone and weight suggestions. Follow its directive for encouragement and weight adjustments. If no directive is present, acknowledge the set briefly.

Tone: Professional, energetic, and concise.`;
}

const suggestSwapDeclaration = {
  name: 'suggest_swap',
  description: 'Suggests alternative exercises when a user wants to swap an exercise due to equipment availability, injury, preference, etc.',
  parameters: {
    type: 'object',
    properties: {
      original_exercise: { type: 'string', description: 'The exercise the user wants to replace' },
      reason: { type: 'string', description: 'Why the user wants to swap (e.g. equipment taken, injury, preference)' },
      alternatives: {
        type: 'array',
        description: 'List of 3 alternative exercises',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the alternative exercise' },
            description: { type: 'string', description: 'Brief reason why this is a good alternative' },
            is_recommended: { type: 'boolean', description: 'Whether this is the top recommended alternative' },
          },
          required: ['name', 'description', 'is_recommended'],
        },
      },
    },
    required: ['original_exercise', 'alternatives'],
  },
};

const logSetDeclaration = {
  name: 'log_set',
  description: 'Logs a completed exercise set and triggers the UI rest timer.',
  parameters: {
    type: 'object',
    properties: {
      exercise_id: { type: 'string', description: 'Name or ID of the exercise' },
      set_number: { type: 'integer', description: 'Current set number' },
      weight: { type: 'number', description: 'Weight lifted' },
      weight_unit: { type: 'string', description: 'Unit of weight', enum: ['kg', 'lbs'] },
      reps: { type: 'integer', description: 'Number of repetitions completed' },
      rpe: { type: 'number', description: 'Rate of Perceived Exertion (1-10)' },
      recommended_rest_seconds: { type: 'integer', description: 'AI determined rest time in seconds' },
    },
    required: ['exercise_id', 'set_number', 'weight', 'weight_unit', 'reps', 'recommended_rest_seconds'],
  },
};

const modifyWorkoutDeclaration = {
  name: 'modify_workout',
  description: 'Modifies or replaces the current workout based on user preferences, injuries, or fatigue.',
  parameters: {
    type: 'object',
    properties: {
      modification_type: { type: 'string', enum: ['adjust', 'replace'], description: 'adjust = tweak existing, replace = generate new' },
      instructions: { type: 'string', description: 'What the user wants changed' },
      current_exercises: { type: 'array', items: { type: 'object' }, description: 'Current workout exercises' },
    },
    required: ['modification_type', 'instructions'],
  },
};

/**
 * Handle a coach message — extracted from the old POST handler.
 * Takes args directly (no req/res). Throws on error.
 */
async function handleMessage({ message, history, userContext }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing');
  }

  // Normalize context through memory agent
  const agentContext = buildAgentContext(userContext);

  let validHistory = history || [];
  if (validHistory.length > 0 && validHistory[0].role === 'model') {
    validHistory = [
      { role: 'user', parts: [{ text: 'Hi Aura, I am ready to start.' }] },
      ...validHistory,
    ];
  }

  const ai = new GoogleGenAI({ apiKey });

  const isPreWorkout = !agentContext.workout.sessionId;
  const declarations = isPreWorkout
    ? [logSetDeclaration, suggestSwapDeclaration, modifyWorkoutDeclaration]
    : [logSetDeclaration, suggestSwapDeclaration];

  const chat = ai.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: buildSystemPrompt(agentContext),
      tools: [{ functionDeclarations: declarations }],
    },
    history: validHistory,
  });

  const response = await chat.sendMessage({ message });

  let functionCallData = null;
  let swapData = null;
  let workoutCardData = null;
  let textResponse = response.text;

  const calls = response.functionCalls;

  if (calls && calls.length > 0) {
    const call = calls[0];
    if (call.name === 'log_set') {
      functionCallData = call.args;

      // Evaluate set through Motivation Engine to shape LLM response tone
      let motivationHint = null;
      try {
        const evaluation = evaluateSet({
          rpe: call.args.rpe,
          goal: agentContext.user.goal,
          currentWeight: call.args.weight,
          weightUnit: call.args.weight_unit,
          exerciseName: call.args.exercise_id,
        });
        motivationHint = evaluation.messageHint;
      } catch {}

      const functionResponseData = { status: 'success', set_logged: call.args };
      if (motivationHint) {
        functionResponseData.coaching_hint = motivationHint;
      }

      const toolResult = await chat.sendMessage({
        message: [{
          functionResponse: {
            name: 'log_set',
            response: functionResponseData,
          },
        }],
      });
      textResponse = toolResult.text;
    } else if (call.name === 'suggest_swap') {
      swapData = call.args;

      const toolResult = await chat.sendMessage({
        message: [{
          functionResponse: {
            name: 'suggest_swap',
            response: { status: 'success', alternatives_shown: swapData.alternatives?.length || 0 },
          },
        }],
      });
      textResponse = toolResult.text;
    } else if (call.name === 'modify_workout') {
      const { handleWorkoutModification } = require('./planning');
      try {
        const modResult = await withTimeout(
          handleWorkoutModification(call.args, agentContext),
          TIMEOUTS.planningInner,
          'Planning Agent (via orchestrator)'
        );

        const toolResult = await chat.sendMessage({
          message: [{
            functionResponse: {
              name: 'modify_workout',
              response: { status: 'success', ...modResult.workoutCard },
            },
          }],
        });
        textResponse = toolResult.text;
        workoutCardData = modResult.workoutCard;
      } catch (modErr) {
        console.error('modify_workout in orchestrator timed out:', modErr.message);
        const toolResult = await chat.sendMessage({
          message: [{
            functionResponse: {
              name: 'modify_workout',
              response: { status: 'error', error: 'Workout generation took too long. Ask the user to try again.' },
            },
          }],
        });
        textResponse = toolResult.text;
      }
    }
  }

  return {
    text: textResponse,
    functionCall: functionCallData,
    swapSuggestion: swapData,
    workoutCard: workoutCardData,
  };
}

module.exports = { handleMessage };
