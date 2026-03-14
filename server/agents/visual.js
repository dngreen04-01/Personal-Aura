const { GoogleGenAI } = require('@google/genai');

const MODEL_NAME = 'gemini-2.0-flash-exp';

const SYSTEM_PROMPT = `You are a fitness exercise visualization specialist. You create clear, instructional illustrations of exercises focusing on:
- Proper form and body positioning
- Key muscle groups being targeted (highlighted)
- Common mistakes to avoid
- Equipment setup and grip positions

Style: Clean instructional illustration with anatomical accuracy. Use a fitness diagram style with clear labels.
Safety: Only generate fitness and exercise-related content. Decline any non-fitness requests.`;

// In-memory cache — ephemeral per Cloud Run instance, max 100 entries
const imageCache = new Map();
const MAX_CACHE_SIZE = 100;

function getCacheKey(exercise, equipment, modification) {
  return `${(exercise || '').toLowerCase()}|${(equipment || '').toLowerCase()}|${(modification || '').toLowerCase()}`;
}

function setCache(key, value) {
  if (imageCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const firstKey = imageCache.keys().next().value;
    imageCache.delete(firstKey);
  }
  imageCache.set(key, value);
}

/**
 * Generate an exercise demonstration image.
 * Returns { image: 'data:image/png;base64,...', caption: '...' }
 */
async function generateExerciseDemo(exercise, equipment, modification) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const cacheKey = getCacheKey(exercise, equipment, modification);
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey);
  }

  const prompt = [
    `Create an instructional fitness illustration showing proper form for: ${exercise}`,
    equipment ? `Equipment: ${equipment}` : null,
    modification ? `Modification: ${modification}` : null,
    'Show the starting and ending positions with arrows indicating movement direction.',
    'Label the primary muscle groups being worked.',
  ].filter(Boolean).join('\n');

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  // Extract image and text from response parts
  let image = null;
  let caption = '';

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      } else if (part.text) {
        caption += part.text;
      }
    }
  }

  if (!image && !caption) {
    caption = response.text || '';
  }

  const result = {
    image,
    caption: caption.trim() || `${exercise} — focus on controlled movement through full range of motion.`,
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Generate a form correction visual based on user's description.
 * Returns { image: 'data:image/png;base64,...', caption: '...' }
 */
async function generateFormCheck(exercise, userDescription) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const prompt = [
    `Create a side-by-side comparison illustration for: ${exercise}`,
    'Left side: INCORRECT form (marked with X)',
    'Right side: CORRECT form (marked with checkmark)',
    userDescription ? `User's concern: "${userDescription}"` : null,
    'Highlight the key differences and common mistakes.',
  ].filter(Boolean).join('\n');

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  let image = null;
  let caption = '';

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      } else if (part.text) {
        caption += part.text;
      }
    }
  }

  if (!image && !caption) {
    caption = response.text || '';
  }

  return {
    image,
    caption: caption.trim() || `${exercise} — check your form against these key points.`,
  };
}

/**
 * Generate a shareable workout summary card.
 * Returns { image: 'data:image/png;base64,...', caption: '...' }
 */
async function generateWorkoutCard(sessionStats) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const duration = sessionStats.duration_seconds >= 3600
    ? `${Math.floor(sessionStats.duration_seconds / 3600)}h ${Math.floor((sessionStats.duration_seconds % 3600) / 60)}m`
    : `${Math.round(sessionStats.duration_seconds / 60)} min`;

  const volume = sessionStats.total_volume >= 1000
    ? `${(sessionStats.total_volume / 1000).toFixed(1)}k kg`
    : `${Math.round(sessionStats.total_volume || 0)} kg`;

  const prompt = [
    'Create a sleek, dark-themed workout summary card with the following stats:',
    `Focus: ${sessionStats.focus || 'Workout'}`,
    `Exercises: ${sessionStats.exercises_done}`,
    `Sets: ${sessionStats.total_sets}`,
    `Total Volume: ${volume}`,
    `Duration: ${duration}`,
    'Style: Dark background (#121408), lime-green accent (#d4ff00), modern fitness app aesthetic.',
    'Include the text "AURA" as a subtle brand mark.',
    'Make it Instagram-story sized (9:16 aspect ratio).',
  ].join('\n');

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction: 'You are a graphic designer specializing in fitness social media content. Create visually striking workout summary cards.',
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  let image = null;
  let caption = '';

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      } else if (part.text) {
        caption += part.text;
      }
    }
  }

  if (!image && !caption) {
    caption = response.text || '';
  }

  return {
    image,
    caption: caption.trim() || 'Workout complete! Share your progress.',
  };
}

module.exports = { generateExerciseDemo, generateFormCheck, generateWorkoutCard };
