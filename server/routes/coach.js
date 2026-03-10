const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const router = express.Router();

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

function buildSystemPrompt(userContext) {
  const ctx = userContext || {};
  const progressionBlock = ctx.progression ? `
- Progression Status: ${ctx.progression.pushReason || 'On track'}
- Avg RPE: ${ctx.progression.avgRpe != null ? ctx.progression.avgRpe.toFixed(1) : 'N/A'}
- Suggested Weight: ${ctx.progression.suggestedWeight || 'N/A'}${ctx.weightUnit || 'kg'}
- Plateaued: ${ctx.progression.isPlateaued ? 'Yes' : 'No'}` : '';

  const contextBlock = ctx.goal ? `

Current Context:
- User Goal: ${ctx.goal}
- Equipment: ${ctx.equipment || 'Unknown'}
- Today's Focus: ${ctx.currentDay?.focus || 'General'}
- Current Exercise: ${ctx.currentExercise || 'Not started'}
- Weight Unit: ${ctx.weightUnit || 'kg'}
- Today's Plan: ${ctx.planSummary || 'No plan loaded'}${progressionBlock}
` : '';

  const completionDirective = ctx.workoutComplete ? `

IMPORTANT — WORKOUT COMPLETE:
The user just finished their entire workout. Deliver a celebratory, personalized message based on these stats:
- Exercises completed: ${ctx.workoutComplete.exercises_done}
- Total sets: ${ctx.workoutComplete.total_sets}
- Total volume: ${Math.round(ctx.workoutComplete.total_volume || 0)}kg
- Duration: ${Math.round((ctx.workoutComplete.duration_seconds || 0) / 60)} minutes
Write 2-3 sentences. Reference specific stats (volume, exercises, sets). Be genuinely encouraging and vary your tone — don't be generic. This is the last thing they see before leaving.
` : '';

  return `You are Aura, an elite, highly motivating personal training agent. You are currently speaking with the user during their workout.
${contextBlock}${completionDirective}
Your Core Directives:
1. Brevity: The user is mid-workout. Keep responses to 1-2 short sentences. Do not use fluff.
2. Motivation: Acknowledge their effort. If they hit a personal best, celebrate it.
3. Data Parsing: When the user logs a set, you MUST trigger the log_set function.
4. Rest Timers: After every logged set, automatically determine the optimal rest time and trigger the log_set function with recommended_rest_seconds. Use these guidelines: 60-90s for hypertrophy, 120-180s for strength, 30-60s for endurance.
5. Exercise Swaps: When a user asks to swap, replace, or find an alternative for an exercise (due to equipment unavailability, injury, preference, etc.), you MUST call the suggest_swap function. Provide 3 alternatives that target the same muscle groups. Mark the best overall alternative as recommended. Include a brief reason for each suggestion (e.g. "Better stabilization required", "Maximum isolation", "High tricep activation").
6. Weight Progression: If the Progression Status indicates a push recommendation, briefly encourage the user to try the suggested weight. Be confident but not pushy — frame it as earned progress. If RPE data shows they're ready, mention it naturally (e.g., "Your last few sets looked smooth — let's try 82.5kg today").

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

router.post('/', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
    }

    const { history, message, userContext } = req.body;

    let validHistory = history || [];
    if (validHistory.length > 0 && validHistory[0].role === 'model') {
      validHistory = [
        { role: 'user', parts: [{ text: 'Hi Aura, I am ready to start.' }] },
        ...validHistory,
      ];
    }

    const ai = new GoogleGenAI({ apiKey });

    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: buildSystemPrompt(userContext),
        tools: [{ functionDeclarations: [logSetDeclaration, suggestSwapDeclaration] }],
      },
      history: validHistory,
    });

    const response = await chat.sendMessage({ message });

    let functionCallData = null;
    let swapData = null;
    let textResponse = response.text;

    const calls = response.functionCalls;

    if (calls && calls.length > 0) {
      const call = calls[0];
      if (call.name === 'log_set') {
        functionCallData = call.args;

        // Send function result back to get final text
        const toolResult = await chat.sendMessage({
          message: [{
            functionResponse: {
              name: 'log_set',
              response: { status: 'success', set_logged: call.args },
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
      }
    }

    res.json({
      text: textResponse,
      functionCall: functionCallData,
      swapSuggestion: swapData,
    });
  } catch (error) {
    console.error('Coach API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
