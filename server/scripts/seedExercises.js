/**
 * Seed script: Populates Firestore `exercises/` collection from Exercise_Reference.json.
 * Idempotent — safe to re-run (uses merge: true, preserves existing media URLs).
 *
 * Usage: node server/scripts/seedExercises.js
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'aura-fitness-api',
  });
}
const db = admin.firestore();

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function inferCategory(tags, primaryMuscles = []) {
  const t = tags.map(tag => tag.toLowerCase());
  const muscles = primaryMuscles.map(m => m.toLowerCase()).join(' ');

  // Explicit lower body
  if (t.includes('lowerbody') || t.includes('legs')) return 'Legs';
  if (t.includes('glutes') || t.includes('hamstrings') || t.includes('quads') ||
      t.includes('calves') || t.includes('adductors')) return 'Legs';

  // Core
  if (t.includes('core') || t.includes('abs') || t.includes('obliques') ||
      t.includes('lowerback')) return 'Core';

  // Cardio
  if (t.includes('cardio') || t.includes('conditioning')) return 'Cardio';

  // FullBody
  if (t.includes('fullbody')) return 'Compound';

  // Explicit push/pull
  if (t.includes('push') || t.includes('chest')) return 'Push';
  if (t.includes('pull') || t.includes('back')) return 'Pull';

  // Shoulders
  if (t.includes('shoulders')) return 'Push';

  // Arms/Forearms — classify by primary muscles
  if (t.includes('arms') || t.includes('forearms')) {
    if (muscles.includes('tricep')) return 'Push';
    return 'Pull'; // biceps, brachialis, forearms
  }

  // UpperBody fallback — use primary muscles to disambiguate
  if (t.includes('upperbody')) {
    if (muscles.includes('tricep')) return 'Push';
    if (muscles.includes('bicep') || muscles.includes('brachialis') ||
        muscles.includes('brachioradialis') || muscles.includes('forearm') ||
        muscles.includes('lat') || muscles.includes('rhomboid')) return 'Pull';
    return 'Push';
  }

  if (t.includes('compound')) return 'Compound';
  return 'Compound';
}

function inferDifficulty(tags) {
  const t = tags.map(tag => tag.toLowerCase());
  if (t.includes('advanced')) return 'advanced';
  if (t.includes('beginner')) return 'beginner';
  if (t.includes('bodyweight') && !t.includes('compound')) return 'beginner';
  return 'intermediate';
}

function transformExercise(ex) {
  return {
    name: ex.name,
    category: inferCategory(ex.tags, ex.muscles.primary),
    primaryMuscles: ex.muscles.primary,
    secondaryMuscles: ex.muscles.secondary,
    equipment: ex.equipment,
    instructions: ex.instructions,
    tips: typeof ex.tips === 'string' ? [ex.tips] : (ex.tips || []),
    difficulty: inferDifficulty(ex.tags),
    alternatives: ex.alternatives,
    tags: ex.tags.map(t => t.toLowerCase()),
  };
}

function loadExercises() {
  const filePath = path.join(__dirname, '..', '..', 'Docs', 'Exercise_Reference.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  // Handle concatenated JSON arrays: ]\n[ → ,
  const fixed = raw.replace(/\]\s*\[/g, ',');
  return JSON.parse(fixed);
}

async function seed() {
  const rawExercises = loadExercises();
  const exercises = rawExercises.map(transformExercise);

  console.log(`Seeding ${exercises.length} exercises from Exercise_Reference.json...`);

  // Batch writes (Firestore limit: 500 per batch)
  let batch = db.batch();
  let count = 0;

  for (const ex of exercises) {
    const id = slug(ex.name);
    const ref = db.collection('exercises').doc(id);
    // merge: true preserves existing fields (e.g. imageUrl, gifUrl, thumbnailUrl)
    batch.set(ref, ex, { merge: true });

    count++;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
      console.log(`  Committed ${count} exercises...`);
    }
  }

  if (count % 450 !== 0) {
    await batch.commit();
  }

  console.log(`Done! Seeded ${count} exercises.`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
