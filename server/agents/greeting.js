const { GoogleGenAI } = require('@google/genai');
const { buildGreetingContext } = require('./memory');

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

const JSON_SHAPE_DOC = `
Return JSON matching this exact shape:
{
  "text": string,            // Opening message, 2-3 sentences, conversational. Supports **bold** for emphasis.
  "chips": string[],         // 2-3 short quick-reply options (2-5 words each)
  "branches": [              // One entry per chip, in matching order
    {
      "chip": string,         // Must exactly match the chip it corresponds to
      "text": string,         // Aura's response (1-2 sentences)
      "nextChips": string[] | null,    // Optional next-turn chips (e.g. location confirmation)
      "nextBranches": [                // Terminal follow-ups for each nextChip, in matching order
        {
          "chip": string,
          "text": string,
          "showsWorkoutCard": true
        }
      ] | null,
      "showsWorkoutCard": boolean,     // True if this branch terminally reveals the workout card (no further chips)
      "handoffToCoach": boolean,        // True to break out of the script and hand the prefillMessage to the live coach
      "prefillMessage": string | null  // Only when handoffToCoach is true
    }
  ]
}`;

function buildSystemPrompt(greetingContext, locationName, locationsCount) {
  const multiLocation = locationsCount > 1;
  return `You are Aura, a warm and motivating personal training coach. Generate a conversational pre-workout opener as a structured JSON tree.

${greetingContext}
${locationName ? `Default location: ${locationName} (user has ${locationsCount} saved location${locationsCount === 1 ? '' : 's'})` : ''}

${JSON_SHAPE_DOC}

## Writing guidelines

### Turn 1 (top-level): opener + main choice
- text: 2-3 sentences. Start with a time-of-day-appropriate greeting ("Morning", "Afternoon", etc.). Mention the streak encouragingly if any. If training history contains a recent compound lift (bench press, squat, deadlift, overhead press), ask specifically about progressing it — use **bold** for the key weight or rep suggestion. Otherwise offer a simple choice about today's workout.
- chips: 2-3 options, 2-5 words each.
  Examples when bench history exists:
    ["Push to 82.5 kg", "Keep 80, more reps", "Swap to something else"]
  Examples when no specific progression:
    ["Let's do it", "Change today's focus", "I'm not feeling it"]

### Turn 2 (branches): response to each chip
For chips that mean "proceed with today's plan":
  - Acknowledge warmly in 1 sentence.
  ${multiLocation
    ? `- Then ask which location, setting nextChips like ["Yes", "Home gym today"].
  - Each nextBranch MUST set showsWorkoutCard: true with text like "Perfect. Here's today's plan. Start whenever you're warm."`
    : `- Then set showsWorkoutCard: true with text like "Perfect. Here's today's plan. Start whenever you're warm." Do NOT use nextChips/nextBranches.`}

For chips that mean "swap/change/adjust/not feeling it":
  - Set handoffToCoach: true and prefillMessage describing the user's intent (e.g., "I want to swap today's main lift for something else" or "Let's adjust today's workout — I'm not feeling it").
  - Do NOT set showsWorkoutCard, nextChips, or nextBranches for these branches.

## Hard rules
- Every chip in the top-level \`chips\` array MUST have a matching entry in \`branches\` with identical string match on \`chip\`.
- Every chip in a branch's \`nextChips\` MUST have a matching entry in \`nextBranches\`.
- Each terminal branch must satisfy exactly ONE of: showsWorkoutCard === true, handoffToCoach === true, OR nextChips + nextBranches set.
- Keep all text concise and warm — never cheesy, never filler.
- Do NOT hallucinate workout exercise details — the client attaches the actual plan to the workout card automatically.
- Output valid JSON only — no markdown fences, no prose.`;
}

function buildFallbackTree(ctx) {
  const streakLine = ctx.streak?.current > 0
    ? `${ctx.streak.current}-day streak — nice work. `
    : '';
  const focusLine = ctx.todayFocus
    ? `Today we're on **${ctx.todayFocus}**.`
    : "Ready for today's session?";
  return {
    text: `${streakLine}${focusLine}`,
    chips: ["Show me today's plan"],
    branches: [
      {
        chip: "Show me today's plan",
        text: "Here's today's plan. Start whenever you're warm.",
        showsWorkoutCard: true,
      },
    ],
  };
}

function validateTree(tree) {
  if (!tree || typeof tree !== 'object') return false;
  if (typeof tree.text !== 'string' || !tree.text.trim()) return false;
  if (!Array.isArray(tree.chips) || tree.chips.length === 0) return false;
  if (!Array.isArray(tree.branches)) return false;
  if (tree.branches.length !== tree.chips.length) return false;

  for (const branch of tree.branches) {
    if (!branch || typeof branch !== 'object') return false;
    if (typeof branch.chip !== 'string' || typeof branch.text !== 'string') return false;
    const terminal = branch.showsWorkoutCard === true || branch.handoffToCoach === true;
    const hasNext = Array.isArray(branch.nextChips) && branch.nextChips.length > 0;
    if (!terminal && !hasNext) return false;
    if (hasNext) {
      if (!Array.isArray(branch.nextBranches) || branch.nextBranches.length !== branch.nextChips.length) return false;
    }
  }
  return true;
}

async function generateGreetingTree({ userContext, locationName, locationsCount = 1 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing');
  }

  // If we have almost nothing to personalize on, skip the LLM call.
  const ctx = userContext || {};
  if (!ctx.goal && !ctx.todayFocus) {
    return buildFallbackTree(ctx);
  }

  const ai = new GoogleGenAI({ apiKey });
  const greetingContext = buildGreetingContext(ctx);

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: 'Generate the pre-workout greeting conversation tree as JSON.',
      config: {
        systemInstruction: buildSystemPrompt(greetingContext, locationName, locationsCount),
        responseMimeType: 'application/json',
      },
    });

    const tree = JSON.parse(response.text);
    if (!validateTree(tree)) {
      throw new Error('Invalid tree shape');
    }
    return tree;
  } catch (err) {
    console.warn('[Greeting] Tree generation failed, using fallback:', err.message);
    return buildFallbackTree(ctx);
  }
}

module.exports = { generateGreetingTree, buildFallbackTree, validateTree };
