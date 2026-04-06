import { useState, useEffect, useCallback } from 'react';
import { startSession, endSession, getSessionState, getUserProfile, saveSessionState, createSessionBlock, getSessionBlocks, createBlocksFromPlan } from '../lib/database';
import { validateBlockPlan } from '../lib/validateBlockPlan';

/**
 * Manages workout session lifecycle: create/resume session, create blocks
 * (strength or mixed), persist position state, load user profile.
 *
 * Returns blockMap: { exerciseName → blockId } for dual-write in handleDone.
 * Returns sessionBlocks: parsed block rows for block-type routing.
 */
export default function useWorkoutSession({ day, location, startIdx, resumeSessionId, exercises }) {
  const [sessionId, setSessionId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [blockMap, setBlockMap] = useState({});
  const [sessionBlocks, setSessionBlocks] = useState([]);
  const [currentExIdx, setCurrentExIdx] = useState(parseInt(startIdx) || 0);
  const [currentSet, setCurrentSet] = useState(1);
  const [completedExercises, setCompletedExercises] = useState(new Set());
  const [exerciseSets, setExerciseSets] = useState({});
  const [ready, setReady] = useState(false);

  // --- Create blocks from a validated plan's blocks array ---
  const createBlocksFromValidatedPlan = useCallback(async (sid, planBlocks) => {
    // Check if blocks already exist (resume case)
    const existing = await getSessionBlocks(sid);
    if (existing.length > 0) {
      const map = {};
      for (const b of existing) {
        const config = b.config_json ? JSON.parse(b.config_json) : {};
        if (config.exercise) map[config.exercise] = b.id;
      }
      return map;
    }

    // Validate and create blocks
    const validation = validateBlockPlan({ blocks: planBlocks });
    if (validation.valid) {
      const created = await createBlocksFromPlan(sid, validation.normalized);
      const map = {};
      for (const c of created) {
        // Build exerciseName→blockId map for strength blocks (dual-write)
        const block = validation.normalized.blocks.find(b => b.block_index === c.blockIndex);
        if (block?.block_type === 'strength' && block.config?.exercise) {
          map[block.config.exercise] = c.blockId;
        }
      }
      return map;
    }
    // Validation failed — fall back to strength blocks from exercises
    return {};
  }, []);

  // --- Create strength blocks for each exercise ---
  const createStrengthBlocks = useCallback(async (sid, exList) => {
    // Check if blocks already exist (resume case)
    const existing = await getSessionBlocks(sid);
    if (existing.length > 0) {
      const map = {};
      for (const b of existing) {
        const config = b.config_json ? JSON.parse(b.config_json) : {};
        if (config.exercise) map[config.exercise] = b.id;
      }
      return map;
    }

    const map = {};
    for (let i = 0; i < exList.length; i++) {
      const ex = exList[i];
      const blockId = await createSessionBlock(sid, i, 'strength', ex.name, {
        exercise: ex.name,
        target_sets: parseInt(ex.sets) || 4,
        target_reps: ex.reps,
      });
      map[ex.name] = blockId;
    }
    return map;
  }, []);

  // --- Init ---
  useEffect(() => {
    const init = async () => {
      let sid;
      if (resumeSessionId) {
        sid = parseInt(resumeSessionId);
        setSessionId(sid);
        try {
          const state = await getSessionState(sid);
          if (state?.position_json) {
            const pos = JSON.parse(state.position_json);
            if (pos.currentExIdx != null) setCurrentExIdx(pos.currentExIdx);
            if (pos.currentSet != null) setCurrentSet(pos.currentSet);
            if (pos.completedExercises) setCompletedExercises(new Set(pos.completedExercises));
            if (pos.exerciseSets) setExerciseSets(pos.exerciseSets);
          }
        } catch {}
      } else if (day) {
        sid = await startSession(day.day, day.focus, location?.id || null, { exercisesJson: JSON.stringify(day) });
        setSessionId(sid);
      }

      // Create blocks from plan (idempotent).
      // If the plan has a blocks array (new plans), use it directly.
      // Otherwise fall back to auto-creating strength blocks per exercise.
      if (sid) {
        const planBlocks = day?.blocks;
        let map;
        if (planBlocks && planBlocks.length > 0) {
          map = await createBlocksFromValidatedPlan(sid, planBlocks);
        } else if (exercises.length > 0) {
          map = await createStrengthBlocks(sid, exercises);
        }
        if (map) setBlockMap(map);

        // Load all session blocks for block-type routing
        const rows = await getSessionBlocks(sid);
        setSessionBlocks(rows.map(b => ({
          ...b,
          config: b.config_json ? JSON.parse(b.config_json) : {},
        })));
      }

      try {
        const profile = await getUserProfile();
        setUserProfile(profile);
      } catch {}

      setReady(true);
    };
    init();
  }, []);

  // --- Debounced position save ---
  useEffect(() => {
    if (!sessionId || !day) return;
    const timeout = setTimeout(() => {
      saveSessionState(sessionId, day, {
        currentExIdx,
        currentSet,
        completedExercises: Array.from(completedExercises),
        exerciseSets,
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timeout);
  }, [sessionId, currentExIdx, currentSet, completedExercises, exerciseSets]);

  return {
    sessionId,
    userProfile,
    blockMap,
    sessionBlocks,
    currentExIdx, setCurrentExIdx,
    currentSet, setCurrentSet,
    completedExercises, setCompletedExercises,
    exerciseSets, setExerciseSets,
    ready,
  };
}
