import { useState, useEffect, useRef, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import useTimerCore from './useTimerCore';
import { saveBlockTimer, clearRestTimer, getActiveBlockTimer, logTimedEffort } from '../lib/database';
import {
  showBlockTimerNotification, fireBlockAlarm, dismissBlockTimerNotification,
  stopAlarm, cancelAll, notifee, EventType, ACTION_TIMER_CONTINUE, ACTION_EXTEND_15S,
} from '../lib/notifications';

/**
 * Interval timer: work/rest phase cycling with round tracking.
 *
 * State machine: IDLE → WORK(1) → REST(1) → WORK(2) → … → REST(N) → COMPLETE
 *
 * Built on useTimerCore for countdown engine, AppState sync, and drift resistance.
 */
export default function useIntervalTimer({
  sessionId,
  blockId,
  config, // { work_sec, rest_sec, rounds }
  onRoundComplete,
  onBlockComplete,
}) {
  const { work_sec = 30, rest_sec = 15, rounds = 1 } = config || {};

  const [currentRound, setCurrentRound] = useState(1);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'work' | 'rest' | 'complete'
  const [isPaused, setIsPaused] = useState(false);

  const phaseRef = useRef('idle');
  const roundRef = useRef(1);
  const timerIdRef = useRef(null);
  const alarmCapRef = useRef(null);
  const onRoundCompleteRef = useRef(onRoundComplete);
  const onBlockCompleteRef = useRef(onBlockComplete);
  onRoundCompleteRef.current = onRoundComplete;
  onBlockCompleteRef.current = onBlockComplete;

  // Phase completion handler — advances the state machine
  const handlePhaseComplete = useCallback(() => {
    const currentPhase = phaseRef.current;
    const round = roundRef.current;

    if (currentPhase === 'work') {
      // Log the completed work effort
      if (blockId) {
        logTimedEffort(blockId, (round - 1) * 2, work_sec, { round, phase: 'work' }).catch(() => {});
      }

      if (rest_sec > 0) {
        // Transition to rest phase
        phaseRef.current = 'rest';
        setPhase('rest');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        showBlockTimerNotification(`Round ${round} of ${rounds}`, rest_sec, timerIdRef.current, 'rest');
        saveBlockTimer(
          Date.now() + rest_sec * 1000, sessionId, 'interval',
          { round, phase: 'rest', work_sec, rest_sec, total_rounds: rounds }
        ).catch(() => {});
        core.start(rest_sec);
      } else {
        // No rest — go directly to next round or complete
        advanceRound(round);
      }
    } else if (currentPhase === 'rest') {
      advanceRound(round);
    }
  }, [blockId, work_sec, rest_sec, rounds, sessionId]);

  const core = useTimerCore({ onComplete: handlePhaseComplete });

  // Advance to next round or complete the block
  const advanceRound = useCallback((completedRound) => {
    onRoundCompleteRef.current?.(completedRound);

    if (completedRound >= rounds) {
      // Block complete
      phaseRef.current = 'complete';
      setPhase('complete');
      core.reset();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dismissBlockTimerNotification();
      clearRestTimer().catch(() => {});
      onBlockCompleteRef.current?.();
    } else {
      // Next round work phase
      const nextRound = completedRound + 1;
      roundRef.current = nextRound;
      setCurrentRound(nextRound);
      phaseRef.current = 'work';
      setPhase('work');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showBlockTimerNotification(`Round ${nextRound} of ${rounds}`, work_sec, timerIdRef.current, 'work');
      saveBlockTimer(
        Date.now() + work_sec * 1000, sessionId, 'interval',
        { round: nextRound, phase: 'work', work_sec, rest_sec, total_rounds: rounds }
      ).catch(() => {});
      core.start(work_sec);
    }
  }, [rounds, work_sec, rest_sec, sessionId, core]);

  // --- Public API ---

  const start = useCallback(() => {
    timerIdRef.current = Date.now();
    roundRef.current = 1;
    setCurrentRound(1);
    phaseRef.current = 'work';
    setPhase('work');
    setIsPaused(false);
    showBlockTimerNotification(`Round 1 of ${rounds}`, work_sec, timerIdRef.current, 'work');
    saveBlockTimer(
      Date.now() + work_sec * 1000, sessionId, 'interval',
      { round: 1, phase: 'work', work_sec, rest_sec, total_rounds: rounds }
    ).catch(() => {});
    core.start(work_sec);
  }, [rounds, work_sec, rest_sec, sessionId, core]);

  const pause = useCallback(() => {
    core.pause();
    setIsPaused(true);
    dismissBlockTimerNotification();
  }, [core]);

  const resume = useCallback(() => {
    core.resume();
    setIsPaused(false);
    const label = `Round ${roundRef.current} of ${rounds}`;
    showBlockTimerNotification(label, core.remaining, timerIdRef.current, phaseRef.current);
  }, [core, rounds]);

  const skipPhase = useCallback(() => {
    dismissBlockTimerNotification();
    stopAlarm();
    handlePhaseComplete();
  }, [handlePhaseComplete]);

  // --- Recovery from app kill ---
  const recover = useCallback(async () => {
    try {
      const saved = await getActiveBlockTimer();
      if (!saved || saved.timer_kind !== 'interval') return false;
      const ctx = saved.context || {};
      timerIdRef.current = Date.now();
      roundRef.current = ctx.round || 1;
      setCurrentRound(ctx.round || 1);
      phaseRef.current = ctx.phase || 'work';
      setPhase(ctx.phase || 'work');

      const stillActive = core.restoreFromEndTime(
        saved.rest_end_time,
        ctx.phase === 'work' ? ctx.work_sec : ctx.rest_sec
      );
      if (stillActive) {
        const label = `Round ${ctx.round || 1} of ${ctx.total_rounds || rounds}`;
        showBlockTimerNotification(label, core.remaining, timerIdRef.current, ctx.phase || 'work');
      }
      return true;
    } catch { return false; }
  }, [core, rounds]);

  // --- Notifee foreground action handler ---
  useEffect(() => {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type !== EventType.ACTION_PRESS && type !== EventType.PRESS) return;
      const actionId = detail?.pressAction?.id;
      if (actionId === ACTION_TIMER_CONTINUE) {
        skipPhase();
      } else if (actionId === ACTION_EXTEND_15S && phaseRef.current === 'rest') {
        // Extend rest by 15 seconds
        stopAlarm();
        core.start(15);
        showBlockTimerNotification(
          `Round ${roundRef.current} of ${rounds}`, 15, timerIdRef.current, 'rest'
        );
      }
    });
    return unsub;
  }, [skipPhase, core, rounds]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (alarmCapRef.current) clearTimeout(alarmCapRef.current);
      dismissBlockTimerNotification();
    };
  }, []);

  return {
    currentRound,
    totalRounds: rounds,
    phase,
    remaining: core.remaining,
    elapsed: core.elapsed,
    isRunning: core.isRunning,
    isPaused,
    start,
    pause,
    resume,
    skipPhase,
    recover,
  };
}
