/**
 * validateBlockPlan.js
 *
 * Contract layer between the Planning Agent (Gemini) and persistence. Every
 * AI-generated plan must pass this validator before it is written to the
 * session_blocks / block_entries tables. The Planning Agent retries up to 2x
 * on invalid output (per PRD §4).
 *
 * Pure function — no I/O, no DB, no network. Safe to run in tests and on
 * device. Returns a { valid, errors, normalized } triple so callers can both
 * gate writes and persist the canonicalized plan.
 */

// Canonical block types. Keep in sync with the SQLite CHECK constraint in
// lib/database.js on session_blocks.block_type.
export const BLOCK_TYPES = Object.freeze([
  'strength',
  'interval',
  'amrap',
  'emom',
  'circuit',
  'timed',
  'distance',
  'cardio',
  'rest',
]);

// Canonical entry types. Keep in sync with the CHECK constraint on
// block_entries.entry_type.
export const ENTRY_TYPES = Object.freeze([
  'strength_set',
  'timed_effort',
  'distance_effort',
  'round',
  'rest',
]);

// Per-block-type config validators. Each returns an array of error strings
// (empty when valid) and may mutate/normalize the config it is given.
const BLOCK_VALIDATORS = {
  strength: (config, ctx) => {
    const errs = [];
    if (!config.exercise || typeof config.exercise !== 'string') {
      errs.push(`${ctx}: strength block requires 'exercise' (string)`);
    }
    if (!Number.isFinite(config.target_sets) || config.target_sets < 1) {
      errs.push(`${ctx}: strength block requires target_sets >= 1`);
    }
    if (config.target_reps != null && !Number.isFinite(config.target_reps) && typeof config.target_reps !== 'string') {
      errs.push(`${ctx}: target_reps must be number or rep-scheme string (e.g. '8-12')`);
    }
    return errs;
  },
  interval: (config, ctx) => {
    const errs = [];
    if (!Number.isFinite(config.work_sec) || config.work_sec <= 0) {
      errs.push(`${ctx}: interval block requires work_sec > 0`);
    }
    if (!Number.isFinite(config.rest_sec) || config.rest_sec < 0) {
      errs.push(`${ctx}: interval block requires rest_sec >= 0`);
    }
    if (!Number.isFinite(config.rounds) || config.rounds < 1) {
      errs.push(`${ctx}: interval block requires rounds >= 1`);
    }
    return errs;
  },
  amrap: (config, ctx) => {
    const errs = [];
    if (!Number.isFinite(config.time_cap_sec) || config.time_cap_sec <= 0) {
      errs.push(`${ctx}: amrap block requires time_cap_sec > 0`);
    }
    if (!Array.isArray(config.movements) || config.movements.length === 0) {
      errs.push(`${ctx}: amrap block requires non-empty movements array`);
    }
    return errs;
  },
  emom: (config, ctx) => {
    const errs = [];
    if (!Number.isFinite(config.minutes) || config.minutes < 1) {
      errs.push(`${ctx}: emom block requires minutes >= 1`);
    }
    if (!Array.isArray(config.movements) || config.movements.length === 0) {
      errs.push(`${ctx}: emom block requires non-empty movements array`);
    }
    return errs;
  },
  circuit: (config, ctx) => {
    const errs = [];
    if (!Array.isArray(config.stations) || config.stations.length === 0) {
      errs.push(`${ctx}: circuit block requires non-empty stations array`);
    }
    if (!Number.isFinite(config.rounds) || config.rounds < 1) {
      errs.push(`${ctx}: circuit block requires rounds >= 1`);
    }
    return errs;
  },
  timed: (config, ctx) => {
    const errs = [];
    if (!Number.isFinite(config.duration_sec) || config.duration_sec <= 0) {
      errs.push(`${ctx}: timed block requires duration_sec > 0`);
    }
    return errs;
  },
  distance: (config, ctx) => {
    const errs = [];
    if (!Number.isFinite(config.target_distance_m) || config.target_distance_m <= 0) {
      errs.push(`${ctx}: distance block requires target_distance_m > 0`);
    }
    return errs;
  },
  cardio: (config, ctx) => {
    const errs = [];
    const hasDuration = Number.isFinite(config.duration_sec) && config.duration_sec > 0;
    const hasDistance = Number.isFinite(config.target_distance_m) && config.target_distance_m > 0;
    if (!hasDuration && !hasDistance) {
      errs.push(`${ctx}: cardio block requires duration_sec or target_distance_m`);
    }
    if (!config.modality || typeof config.modality !== 'string') {
      errs.push(`${ctx}: cardio block requires modality (e.g. 'run', 'row', 'bike')`);
    }
    return errs;
  },
  rest: (config, ctx) => {
    const errs = [];
    if (!Number.isFinite(config.duration_sec) || config.duration_sec <= 0) {
      errs.push(`${ctx}: rest block requires duration_sec > 0`);
    }
    return errs;
  },
};

function normalizeBlock(block, index) {
  const normalized = {
    block_index: index,
    block_type: block.block_type,
    label: typeof block.label === 'string' ? block.label : '',
    config: block.config && typeof block.config === 'object' ? { ...block.config } : {},
  };
  return normalized;
}

/**
 * Validate a Planning Agent plan against the canonical block schema.
 *
 * @param {object} plan - { blocks: [{ block_type, label, config }, ...] }
 * @returns {{ valid: boolean, errors: string[], normalized: object|null }}
 */
export function validateBlockPlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['plan must be an object'], normalized: null };
  }
  if (!Array.isArray(plan.blocks)) {
    return { valid: false, errors: ["plan.blocks must be an array"], normalized: null };
  }
  if (plan.blocks.length === 0) {
    return { valid: false, errors: ['plan.blocks must contain at least one block'], normalized: null };
  }

  const normalizedBlocks = [];

  plan.blocks.forEach((block, i) => {
    const ctx = `block[${i}]`;
    if (!block || typeof block !== 'object') {
      errors.push(`${ctx}: must be an object`);
      return;
    }
    if (!BLOCK_TYPES.includes(block.block_type)) {
      errors.push(`${ctx}: unknown block_type '${block.block_type}' (expected one of ${BLOCK_TYPES.join(', ')})`);
      return;
    }
    const normalized = normalizeBlock(block, i);
    const validator = BLOCK_VALIDATORS[block.block_type];
    const blockErrors = validator(normalized.config, ctx);
    errors.push(...blockErrors);
    normalizedBlocks.push(normalized);
  });

  if (errors.length > 0) {
    return { valid: false, errors, normalized: null };
  }

  return {
    valid: true,
    errors: [],
    normalized: { blocks: normalizedBlocks },
  };
}

export default validateBlockPlan;
