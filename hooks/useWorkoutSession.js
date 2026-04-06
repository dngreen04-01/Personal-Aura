import { useState, useEffect, useCallback } from 'react';
import { startSession, endSession, getSessionState, getUserProfile, saveSessionState, createSessionBlock, getSessionBlocks } from '../lib/database';

/**
 * Manages workout session lifecycle: create/resume session, create strength
 * blocks, persist position state, load user profile.
 *
 * Returns blockMap: { exerciseName → blockId } for dual-write in handleDone.
 */
export default function useWorkoutSession({ day, location, startIdx, resumeSessionId, exercises }) {
  const [sessionId, setSessionId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [blockMap, setBlockMap] = useState({});
  const [currentExIdx, setCurrentExIdx] = useState(parseInt(startIdx) || 0);
  const [currentSet, setCurrentSet] = useState(1);
  const [completedExercises, setCompletedExercises] = useState(new Set());
  const [exerciseSets, setExerciseSets] = useState({});
  const [ready, setReady] = useState(false);

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

      // Create strength blocks (idempotent)
      if (sid && exercises.length > 0) {
        const map = await createStrengthBlocks(sid, exercises);
        setBlockMap(map);
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
    currentExIdx, setCurrentExIdx,
    currentSet, setCurrentSet,
    completedExercises, setCompletedExercises,
    exerciseSets, setExerciseSets,
    ready,
  };
}
