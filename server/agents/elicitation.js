const { GoogleGenAI } = require('@google/genai');

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

const SYSTEM_PROMPT = `You are Aura's onboarding agent. Your task is to learn about the user's fitness goals, experience, and preferences through a natural 2-3 minute conversation.

Your approach:
1. Start by asking about their primary fitness goal in an open-ended way. Let them describe it naturally — do not offer multiple choice.
2. Based on their answer, ask a follow-up about their experience level and how long they've been training.
3. Ask about any injuries, limitations, or health concerns that could affect their training.
4. Ask about their preferred training style — what types of workouts they enjoy, what they dislike.
5. If they mention a specific sport or event (Hyrox, marathon, etc.), ask about their training focus and competition timeline.

Classification taxonomy — use these values when extracting data:
- primary goal: hypertrophy, body_composition, strength, endurance, sport_performance, functional_fitness, general_health
- modalities: strength, conditioning, cardio, plyometrics, flexibility, sport_specific
- style: moderate_volume, low_rep_high_load, high_rep_low_load, mixed_modality, circuit_based, sport_specific_periodization

Rules:
- Be warm, conversational, and brief (2-3 sentences per turn).
- Ask ONE question at a time. Do not dump multiple questions.
- Do NOT call extract_goals until you have asked at least 3 questions and feel you have enough information.
- When you have enough data, call extract_goals with a confirmation_message summarizing what you learned.
- If the user gives vague answers, ask gentle follow-up questions to clarify.
- Never mention the taxonomy labels to the user — use natural language.`;

const extractGoalsDeclaration = {
  name: 'extract_goals',
  description: 'Extract structured goal and preference data from the conversation once enough information has been gathered (minimum 3 questions asked).',
  parameters: {
    type: 'object',
    properties: {
      goals: {
        type: 'object',
        description: 'Classified fitness goals',
        properties: {
          primary: {
            type: 'string',
            description: 'Primary goal from taxonomy: hypertrophy, body_composition, strength, endurance, sport_performance, functional_fitness, general_health',
          },
          secondary: {
            type: 'array',
            items: { type: 'string' },
            description: 'Secondary goals if mentioned',
          },
          modalities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Training modalities: strength, conditioning, cardio, plyometrics, flexibility, sport_specific',
          },
          style: {
            type: 'string',
            description: 'Training style preference',
          },
        },
        required: ['primary', 'modalities'],
      },
      injuries: {
        type: 'array',
        description: 'Injuries or limitations mentioned',
        items: {
          type: 'object',
          properties: {
            area: { type: 'string', description: 'Body area affected' },
            severity: { type: 'string', enum: ['minor', 'moderate', 'severe'], description: 'Severity level' },
            notes: { type: 'string', description: 'Details about the injury or limitation' },
          },
          required: ['area'],
        },
      },
      sport_context: {
        type: 'object',
        description: 'Sport-specific context if applicable',
        properties: {
          sport: { type: 'string', description: 'Name of the sport or event' },
          competition_focus: { type: 'boolean', description: 'Whether they are training for a specific competition' },
          season_phase: { type: 'string', description: 'Current training phase (off-season, pre-season, in-season, general)' },
        },
      },
      style_preferences: {
        type: 'object',
        description: 'Workout style preferences',
        properties: {
          preferred_session_feel: { type: 'string', description: 'How they want workouts to feel (e.g. intense, balanced, fun, structured)' },
          dislikes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Types of exercises or training they dislike',
          },
          variety_preference: {
            type: 'string',
            enum: ['consistent', 'moderate', 'high'],
            description: 'How much variety they want in their programming',
          },
        },
      },
      confirmation_message: {
        type: 'string',
        description: 'A natural-language summary to confirm with the user, e.g. "So you are training for Hyrox with a focus on building running endurance and functional strength. You have a minor knee issue to work around. Sound right?"',
      },
    },
    required: ['goals', 'confirmation_message'],
  },
};

/**
 * Handle a single turn of the goal elicitation conversation.
 *
 * @param {string} message - User's message text
 * @param {Array} history - Gemini-format message history [{role, parts}]
 * @returns {{ text: string, extractedData?: object, isComplete: boolean }}
 */
async function handleElicitationTurn(message, history = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  let validHistory = history || [];
  if (validHistory.length > 0 && validHistory[0].role === 'model') {
    validHistory = [
      { role: 'user', parts: [{ text: 'Hi, I just signed up.' }] },
      ...validHistory,
    ];
  }

  const ai = new GoogleGenAI({ apiKey });

  const chat = ai.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: [extractGoalsDeclaration] }],
    },
    history: validHistory,
  });

  const response = await chat.sendMessage({ message });

  const calls = response.functionCalls;

  if (calls && calls.length > 0 && calls[0].name === 'extract_goals') {
    const extractedData = calls[0].args;

    // Send function response back to get the confirmation text
    const toolResult = await chat.sendMessage({
      message: [{
        functionResponse: {
          name: 'extract_goals',
          response: { status: 'success', data_extracted: true },
        },
      }],
    });

    return {
      text: extractedData.confirmation_message || toolResult.text,
      extractedData,
      isComplete: true,
    };
  }

  return {
    text: response.text,
    extractedData: null,
    isComplete: false,
  };
}

module.exports = { handleElicitationTurn };
