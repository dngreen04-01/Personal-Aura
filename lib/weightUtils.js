// Weight conversion and formatting utilities

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
 * Available increment steps per unit.
 */
export function getIncrements(unit) {
  return unit === 'lbs' ? [1, 2.5, 5, 10] : [0.5, 1, 2.5, 5];
}

/**
 * Default increment for a unit and body region.
 */
export function getDefaultIncrement(unit, isLowerBody = false) {
  if (unit === 'lbs') return isLowerBody ? 10 : 5;
  return isLowerBody ? 2.5 : 1;
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
 * Snap a weight to the nearest valid plate increment.
 * kg: nearest 0.5, lbs: nearest 1
 */
export function snapToIncrement(value, unit) {
  if (unit === 'lbs') return Math.round(value);
  return Math.round(value * 2) / 2;
}
