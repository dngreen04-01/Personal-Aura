/**
 * Generate exercise instructional images and animated GIFs using Gemini (Nano Banana 2).
 * Uploads to Firebase Cloud Storage and updates Firestore exercise documents.
 *
 * Usage:
 *   node server/scripts/generateExerciseMedia.js [options]
 *
 * Options:
 *   --limit N       Process only N exercises (for testing)
 *   --dry-run       Preview what would be generated without uploading
 *   --only <slug>   Process only a specific exercise
 *   --force         Re-generate even if media already exists
 *   --delay <ms>    Delay between exercises (default: 4000)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');
const sharp = require('sharp');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

// ── Config ──

const MODEL_NAME = 'gemini-3.1-flash-image-preview';
const GIF_WIDTH = 480;
const GIF_HEIGHT = 360;
const GIF_FRAME_DELAY = 1000; // ms per frame
const THUMB_SIZE = 150;
const INTER_CALL_DELAY = 1500; // ms between Gemini API calls
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 5000;

// ── CLI Args ──

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
};
const hasFlag = (name) => args.includes(name);

const LIMIT = getArg('--limit') ? parseInt(getArg('--limit')) : Infinity;
const DRY_RUN = hasFlag('--dry-run');
const ONLY = getArg('--only');
const FORCE = hasFlag('--force');
const DELAY = getArg('--delay') ? parseInt(getArg('--delay')) : 4000;

// ── Firebase Init ──

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'aura-fitness-api',
  });
}
const db = admin.firestore();
const bucket = admin.storage().bucket('aura-fitness-media');

// ── Gemini Init ──

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('ERROR: GEMINI_API_KEY not set in server/.env');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

// ── Helpers ──

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function elapsed(start) {
  return ((Date.now() - start) / 1000).toFixed(1);
}

async function withRetry(fn, label) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const isRateLimit = err.status === 429
        || err.message?.includes('RESOURCE_EXHAUSTED')
        || err.message?.includes('429');
      const delay = isRateLimit
        ? BASE_RETRY_DELAY * Math.pow(2, attempt) + Math.random() * 2000
        : BASE_RETRY_DELAY * (attempt + 1);
      console.log(`    Retry ${attempt + 1}/${MAX_RETRIES} for ${label} after ${Math.round(delay / 1000)}s: ${err.message?.slice(0, 100)}`);
      await sleep(delay);
    }
  }
}

// ── Load Exercises ──

function loadExercises() {
  const filePath = path.join(__dirname, '..', '..', 'Docs', 'Exercise_Reference.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  // Handle concatenated JSON arrays: ]\n[ → ,
  const fixed = raw.replace(/\]\s*\[/g, ',');
  return JSON.parse(fixed);
}

// ── Gemini Image Generation ──

const SYSTEM_PROMPT = `You are a fitness exercise visualization specialist creating clear instructional illustrations.
Style requirements:
- Clean, professional instructional fitness diagram
- Dark background (#121408) with lime-green (#d4ff00) accents
- Anatomically accurate body positioning
- Show a fit person demonstrating the exercise
- Sports medicine quality illustration
- No text overlays or labels`;

/**
 * Generate an image with optional reference images for visual consistency.
 * When referenceImages are provided, Gemini uses them to maintain the same
 * person, angle, and style across frames.
 *
 * @param {string} prompt - Text prompt
 * @param {Buffer[]} referenceImages - Previous frame buffers to use as reference
 * @returns {Buffer|null} - PNG buffer
 */
async function generateImage(prompt, referenceImages = []) {
  // Build contents: text prompt + any reference images
  const parts = [];

  // Add reference images first so Gemini sees them as context
  for (let i = 0; i < referenceImages.length; i++) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: referenceImages[i].toString('base64'),
      },
    });
  }

  // Add the text prompt
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '4:3' },
    },
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
  }
  return null;
}

function buildFramePrompt(exercise, frameIndex, totalFrames, hasReferenceImages) {
  const instructions = exercise.instructions;
  const positions = ['starting', 'mid-movement', 'end/peak'];
  const position = positions[Math.min(frameIndex, positions.length - 1)];

  // Map frame to the most relevant instruction step
  const stepIndex = Math.min(
    Math.floor((frameIndex / totalFrames) * instructions.length),
    instructions.length - 1
  );
  const relevantInstruction = instructions[stepIndex];

  const lines = [
    `Create a fitness instruction illustration of "${exercise.name}" at the ${position} position.`,
    `Current step: ${relevantInstruction}`,
    `Equipment: ${exercise.equipment.join(', ')}`,
    `Primary muscles: ${exercise.muscles.primary.join(', ')}`,
    `This is frame ${frameIndex + 1} of ${totalFrames} in a movement sequence.`,
  ];

  if (hasReferenceImages) {
    lines.push(
      'IMPORTANT: Use the provided reference image(s) as your guide.',
      'Keep the EXACT same person, body type, clothing, camera angle, background, and art style.',
      'Only change the body position to match this phase of the movement.',
    );
  } else {
    lines.push(
      'Show a fit person demonstrating the exercise.',
      'Use a consistent camera angle suitable for showing the full movement.',
    );
  }

  return lines.join('\n');
}

// ── GIF Creation ──

async function createGif(frameBuffers) {
  const gif = GIFEncoder();

  for (const buffer of frameBuffers) {
    const { data, info } = await sharp(buffer)
      .resize(GIF_WIDTH, GIF_HEIGHT, { fit: 'cover' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, info.width, info.height, {
      palette,
      delay: GIF_FRAME_DELAY,
    });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}

// ── Thumbnail ──

async function createThumbnail(imageBuffer) {
  return sharp(imageBuffer)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
    .png({ quality: 80 })
    .toBuffer();
}

// ── Cloud Storage Upload ──

async function uploadToStorage(buffer, filePath, contentType) {
  const file = bucket.file(filePath);

  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  });

  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}

// ── Main Pipeline ──

async function processExercise(exercise, index, total) {
  const exerciseSlug = slug(exercise.name);
  const prefix = `[${index + 1}/${total}]`;

  console.log(`${prefix} ${exercise.name} (${exerciseSlug})`);

  // Check if already processed (idempotency)
  if (!FORCE) {
    const doc = await db.collection('exercises').doc(exerciseSlug).get();
    if (doc.exists && doc.data().imageUrl) {
      console.log('  SKIP: already has media');
      return { status: 'skipped' };
    }
  }

  if (DRY_RUN) {
    console.log('  DRY RUN: would generate main image + 3 frames + GIF + thumbnail');
    return { status: 'dry-run' };
  }

  try {
    // Generate 3 chained frames: each uses previous frame(s) as reference
    // Frame 1 (start) = text only
    // Frame 2 (mid)   = text + frame 1 as reference
    // Frame 3 (end)   = text + frames 1 & 2 as reference
    const FRAME_COUNT = 3;
    const frames = [];

    for (let f = 0; f < FRAME_COUNT; f++) {
      let t = Date.now();
      process.stdout.write(`  Frame ${f + 1}/${FRAME_COUNT}...        `);

      const referenceImages = frames.slice(); // all previous frames
      const prompt = buildFramePrompt(exercise, f, FRAME_COUNT, referenceImages.length > 0);

      const frame = await withRetry(
        () => generateImage(prompt, referenceImages),
        `frame ${f + 1}`
      );
      if (!frame) throw new Error(`Gemini returned no image for frame ${f + 1}`);
      frames.push(frame);
      console.log(`done (${elapsed(t)}s)`);
      if (f < FRAME_COUNT - 1) await sleep(INTER_CALL_DELAY);
    }

    // Use frame 2 (mid-movement) as the main instructional image
    const mainImage = frames[1];

    // Stitch frames into animated GIF
    let t = Date.now();
    process.stdout.write('  GIF stitch...      ');
    const gifBuffer = await createGif(frames);
    console.log(`done (${elapsed(t)}s, ${Math.round(gifBuffer.length / 1024)}KB)`);

    // Create thumbnail from mid-movement frame
    t = Date.now();
    process.stdout.write('  Thumbnail...       ');
    const thumbBuffer = await createThumbnail(mainImage);
    console.log(`done (${elapsed(t)}s)`);

    // 5. Upload to Cloud Storage
    t = Date.now();
    process.stdout.write('  Upload...          ');
    const [imageUrl, gifUrl, thumbnailUrl] = await Promise.all([
      uploadToStorage(mainImage, `exercises/images/${exerciseSlug}.png`, 'image/png'),
      uploadToStorage(gifBuffer, `exercises/gifs/${exerciseSlug}.gif`, 'image/gif'),
      uploadToStorage(thumbBuffer, `exercises/thumbnails/${exerciseSlug}.png`, 'image/png'),
    ]);
    console.log(`done (${elapsed(t)}s)`);

    // 6. Update Firestore
    t = Date.now();
    process.stdout.write('  Firestore...       ');
    await db.collection('exercises').doc(exerciseSlug).set(
      { imageUrl, gifUrl, thumbnailUrl },
      { merge: true }
    );
    console.log(`done (${elapsed(t)}s)`);

    return { status: 'processed' };
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return { status: 'failed', error: err.message };
  }
}

async function main() {
  console.log('=== Exercise Media Generation Pipeline ===');
  console.log(`Model: ${MODEL_NAME}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Force: ${FORCE}`);
  console.log(`Delay: ${DELAY}ms`);
  console.log('');

  const exercises = loadExercises();
  console.log(`Loaded ${exercises.length} exercises from Exercise_Reference.json`);

  // Filter
  let toProcess = exercises;
  if (ONLY) {
    toProcess = exercises.filter(e => slug(e.name) === ONLY);
    if (toProcess.length === 0) {
      console.error(`No exercise found with slug: ${ONLY}`);
      process.exit(1);
    }
  }
  if (LIMIT < toProcess.length) {
    toProcess = toProcess.slice(0, LIMIT);
  }

  console.log(`Processing ${toProcess.length} exercises\n`);

  const startTime = Date.now();
  const results = { processed: 0, skipped: 0, failed: 0, 'dry-run': 0 };

  for (let i = 0; i < toProcess.length; i++) {
    const result = await processExercise(toProcess[i], i, toProcess.length);
    results[result.status]++;

    // Delay between exercises (not after the last one)
    if (i < toProcess.length - 1 && result.status === 'processed') {
      await sleep(DELAY);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  const minutes = Math.floor(totalTime / 60);
  const seconds = totalTime % 60;

  console.log('\n=== Summary ===');
  console.log(`Processed: ${results.processed}`);
  console.log(`Skipped:   ${results.skipped}`);
  console.log(`Failed:    ${results.failed}`);
  if (results['dry-run']) console.log(`Dry run:   ${results['dry-run']}`);
  console.log(`Total time: ${minutes}m ${seconds}s`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
