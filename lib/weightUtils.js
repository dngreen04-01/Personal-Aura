// Weight conversion and formatting utilities.
// NOTE: detectEquipmentType, LOWER_BODY_KEYWORDS, getDefaultIncrement, and
// snapToIncrement are mirrored in lib/incrementUtils.js (CommonJS, server-side).
// Keep the two in sync when editing.

const KG_PER_LB = 0.453592;
const LB_PER_KG = 2.20462;

/**
 * Convert weight between kg and lbs.
 */
export function convertWeight(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  if (fromUnit === 'kg' && toUnit === 'lbs') return value * LB_PER_KG;
  if (fromUnit === 'lbs' && toUnit === 'kg') return value * KG_PER_LB;
  return value;
}

/**
 * Normalize any weight to kg for aggregation.
 */
export function toKg(value, unit) {
  return unit === 'lbs' ? value * KG_PER_LB : value;
}

/**
 * Format weight for display.
 * kg: 1 decimal if fractional (e.g. 22.5), integer otherwise (e.g. 60)
 * lbs: nearest integer
 */
export function formatWeight(value, unit) {
  if (unit === 'lbs') return Math.round(value).toString();
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}

/**
 * Detect equipment type from exercise name.
 */
export function detectEquipmentType(exerciseName) {
  const name = (exerciseName || '').toLowerCase();
  if (name.includes('cable') || name.includes('crossover') || name.includes('pulldown') || name.includes('lat pull'))
    return 'cable';
  if (name.includes('dumbbell') || name.includes('db ') || name.startsWith('db '))
    return 'dumbbell';
  if (name.includes('machine') || name.includes('smith') || name.includes('pec deck') || name.includes('chest fly machine'))
    return 'machine';
  return 'barbell';
}

const LOWER_BODY_KEYWORDS = [
  'squat', 'deadlift', 'rdl', 'lunge', 'leg press', 'leg curl',
  'leg extension', 'hip thrust', 'calf', 'glute', 'hamstring',
  'step up', 'step-up', 'goblet', 'hack squat', 'bulgarian',
];

/**
 * Available increment steps per unit.
 */
export function getIncrements(unit) {
  return unit === 'lbs' ? [2.5, 5, 10, 15] : [1, 2, 2.5, 5];
}

/**
 * Default increment for a unit, optionally equipment-aware.
 * Pass exerciseName to get equipment-specific increments.
 */
export function getDefaultIncrement(unit, exerciseName) {
  // Backward compat: boolean was old isLowerBody param
  if (typeof exerciseName === 'boolean') {
    const isLower = exerciseName;
    if (unit === 'lbs') return isLower ? 10 : 5;
    return isLower ? 5 : 2.5;
  }

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

/**
 * Format the weight badge string (e.g. "+5kg" or "+10lbs").
 */
export function formatWeightBadge(diff, unit) {
  const sign = diff > 0 ? '+' : '';
  const formatted = unit === 'lbs' ? Math.round(diff) : (diff % 1 === 0 ? diff : diff.toFixed(1));
  return `${sign}${formatted}${unit}`;
}

/**
 * Snap a weight to the nearest valid increment for the equipment type.
 */
export function snapToIncrement(value, unit, exerciseName) {
  const equipment = exerciseName ? detectEquipmentType(exerciseName) : null;

  if (equipment === 'cable' || equipment === 'machine') {
    // Cable/machine stacks: nearest 5kg / 5lbs
    const step = unit === 'lbs' ? 5 : 5;
    return Math.round(value / step) * step;
  }
  if (equipment === 'dumbbell') {
    // Dumbbells: nearest 2kg / 2.5lbs
    if (unit === 'lbs') return Math.round(value / 2.5) * 2.5;
    return Math.round(value / 2) * 2;
  }
  // Barbell / unknown: nearest 2.5kg / 5lbs (plate pairs)
  if (unit === 'lbs') return Math.round(value / 5) * 5;
  return Math.round(value * 2) / 2; // nearest 0.5kg
}
