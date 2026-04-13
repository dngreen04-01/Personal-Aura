const { MIN_WORKOUT_DURATION } = require('./constants');

const WARMUP_BUFFER_SEC = 180;
const SEC_PER_REP = 3;
const DEFAULT_REST_SEC = 90;
const DEFAULT_REPS = 10;
const RUN_SEC_PER_KM = 300;
const DEFAULT_STATION_SEC = 30;

function parseReps(reps) {
  if (typeof reps === 'number' && Number.isFinite(reps)) return reps;
  if (!reps) return DEFAULT_REPS;
  const nums = String(reps).match(/\d+/g);
  if (!nums) return DEFAULT_REPS;
  if (nums.length === 1) return parseInt(nums[0], 10);
  return Math.round((parseInt(nums[0], 10) + parseInt(nums[1], 10)) / 2);
}

function blockSeconds(block) {
  const cfg = (block && block.config) || {};
  switch (block && block.block_type) {
    case 'strength': {
      const sets = Number(cfg.target_sets) || 3;
      const reps = parseReps(cfg.target_reps);
      const rest = Number(cfg.rest_seconds) || DEFAULT_REST_SEC;
      return sets * (reps * SEC_PER_REP + rest);
    }
    case 'interval': {
      const rounds = Number(cfg.rounds) || 1;
      const work = Number(cfg.work_sec) || 0;
      const rest = Number(cfg.rest_sec) || 0;
      return rounds * (work + rest);
    }
    case 'amrap':
      return Number(cfg.time_cap_sec) || 0;
    case 'emom':
      return (Number(cfg.minutes) || 0) * 60;
    case 'circuit': {
      const rounds = Number(cfg.rounds) || 1;
      const stations = Array.isArray(cfg.stations) ? cfg.stations : [];
      const perRound = stations.reduce((sum, s) => {
        if (s && s.duration_sec) return sum + Number(s.duration_sec);
        if (s && s.reps) return sum + Number(s.reps) * SEC_PER_REP;
        return sum + DEFAULT_STATION_SEC;
      }, 0);
      return rounds * perRound;
    }
    case 'timed':
    case 'rest':
      return Number(cfg.duration_sec) || 0;
    case 'distance': {
      const meters = Number(cfg.target_distance_m) || 0;
      return (meters / 1000) * RUN_SEC_PER_KM;
    }
    case 'cardio': {
      if (cfg.duration_sec) return Number(cfg.duration_sec);
      if (cfg.target_distance_m) return (Number(cfg.target_distance_m) / 1000) * RUN_SEC_PER_KM;
      return 0;
    }
    default:
      return 0;
  }
}

function exerciseSeconds(exercise) {
  const sets = Number(exercise && exercise.sets) || 3;
  const reps = parseReps(exercise && exercise.reps);
  const rest = Number(exercise && exercise.restSeconds) || DEFAULT_REST_SEC;
  return sets * (reps * SEC_PER_REP + rest);
}

/**
 * Compute session duration in whole minutes from a workout plan.
 * Accepts { blocks, exercises } or a bare exercises[] array (legacy).
 * Blocks take precedence when both are provided.
 */
function calculateWorkoutDuration(input) {
  if (!input) return MIN_WORKOUT_DURATION;
  const blocks = Array.isArray(input) ? null : input.blocks;
  const exercises = Array.isArray(input) ? input : input.exercises;

  let totalSec = WARMUP_BUFFER_SEC;

  if (Array.isArray(blocks) && blocks.length > 0) {
    totalSec += blocks.reduce((sum, b) => sum + blockSeconds(b), 0);
  } else if (Array.isArray(exercises) && exercises.length > 0) {
    totalSec += exercises.reduce((sum, e) => sum + exerciseSeconds(e), 0);
  } else {
    return MIN_WORKOUT_DURATION;
  }

  const minutes = Math.round(totalSec / 60);
  return Math.max(MIN_WORKOUT_DURATION, minutes);
}

function describeFormulaForPrompt() {
  return [
    'Aura computes session duration from block data (seconds, then ÷60 and rounded):',
    `- strength: target_sets × (parseReps(target_reps) × ${SEC_PER_REP}s work + rest_seconds)`,
    '- interval: rounds × (work_sec + rest_sec)',
    '- amrap: time_cap_sec',
    '- emom: minutes × 60',
    `- circuit: rounds × Σ(station.duration_sec || station.reps × ${SEC_PER_REP}s || ${DEFAULT_STATION_SEC}s)`,
    '- timed, rest: duration_sec',
    `- distance, cardio: duration_sec, else (target_distance_m / 1000) × ${RUN_SEC_PER_KM}s`,
    `- Plus a ${WARMUP_BUFFER_SEC}s (${Math.round(WARMUP_BUFFER_SEC / 60)} min) warmup buffer.`,
    `- Defaults when omitted: rest_seconds=${DEFAULT_REST_SEC}s, reps=${DEFAULT_REPS}, target_sets=3.`,
    `- parseReps("8-10") = 9 (midpoint); parseReps("12") = 12.`,
  ].join('\n');
}

/**
 * Extract a target duration in minutes from a user instruction like
 * "1.5 hour full body workout" or "30 min push day". Returns null if absent.
 */
function parseTargetMinutesFromInstruction(instruction) {
  if (!instruction || typeof instruction !== 'string') return null;
  const m = instruction.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('h')) return Math.round(value * 60);
  return Math.round(value);
}

module.exports = {
  calculateWorkoutDuration,
  describeFormulaForPrompt,
  parseTargetMinutesFromInstruction,
  WARMUP_BUFFER_SEC,
  SEC_PER_REP,
  DEFAULT_REST_SEC,
};
