// Server-side CommonJS mirror of the equipment-aware increment helpers in
// lib/weightUtils.js. Keep the two in sync — frontend uses ESM via Metro, so
// the server can't import from there directly.

const LOWER_BODY_KEYWORDS = [
  'squat', 'deadlift', 'rdl', 'lunge', 'leg press', 'leg curl',
  'leg extension', 'hip thrust', 'calf', 'glute', 'hamstring',
  'step up', 'step-up', 'goblet', 'hack squat', 'bulgarian',
];

function detectEquipmentType(exerciseName) {
  const name = (exerciseName || '').toLowerCase();
  if (name.includes('cable') || name.includes('crossover') || name.includes('pulldown') || name.includes('lat pull'))
    return 'cable';
  if (name.includes('dumbbell') || name.includes('db ') || name.startsWith('db '))
    return 'dumbbell';
  if (name.includes('machine') || name.includes('smith') || name.includes('pec deck') || name.includes('chest fly machine'))
    return 'machine';
  return 'barbell';
}

function getDefaultIncrement(unit, exerciseName) {
  const equipment = detectEquipmentType(exerciseName);
  const name = (exerciseName || '').toLowerCase();
  const isLower = LOWER_BODY_KEYWORDS.some(kw => name.includes(kw));

  if (equipment === 'cable' || equipment === 'machine') {
    return unit === 'lbs' ? 10 : 5;
  }
  if (equipment === 'dumbbell') {
    return unit === 'lbs' ? 5 : 2;
  }
  // barbell
  if (isLower) return unit === 'lbs' ? 10 : 5;
  return unit === 'lbs' ? 5 : 2.5;
}

function snapToIncrement(value, unit, exerciseName) {
  const equipment = exerciseName ? detectEquipmentType(exerciseName) : null;

  if (equipment === 'cable' || equipment === 'machine') {
    const step = 5;
    return Math.round(value / step) * step;
  }
  if (equipment === 'dumbbell') {
    if (unit === 'lbs') return Math.round(value / 2.5) * 2.5;
    return Math.round(value / 2) * 2;
  }
  if (unit === 'lbs') return Math.round(value / 5) * 5;
  return Math.round(value * 2) / 2;
}

module.exports = {
  LOWER_BODY_KEYWORDS,
  detectEquipmentType,
  getDefaultIncrement,
  snapToIncrement,
};
