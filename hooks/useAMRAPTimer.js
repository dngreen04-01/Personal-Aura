import { useState, useRef, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import useTimerCore from './useTimerCore';
import { saveBlockTimer, clearRestTimer, getActiveBlockTimer, logRoundEntry } from '../lib/database';
import { showBlockTimerNotification, dismissBlockTimerNotification } from '../lib/notifications';

/**
 * AMRAP timer: count-up timer with a time cap.
 * User manually logs rounds via LOG ROUND button.
 *
 * Built on useTimerCore for countdown engine (counts down from time_cap to 0).
 */
export default function useAMRAPTimer({
  sessionId,
  blockId,
  config, // { time_cap_sec, movements }
  onBlockComplete,
}) {
  const { time_cap_sec = 600, movements = [] } = config || {};

  const [roundCount, setRoundCount] = useState(0);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'active' | 'complete'

  const timerIdRef = useRef(null);
  const roundCountRef = useRef(0);
  const onBlockCompleteRef = useRef(onBlockComplete);
  onBlockCompleteRef.current = onBlockComplete;

  const handleTimerComplete = useCallback(() => {
    setPhase('complete');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    dismissBlockTimerNotification();
    clearRestTimer().catch(() => {});
    onBlockCompleteRef.current?.();
  }, []);

  const core = useTimerCore({ onComplete: handleTimerComplete });

  const start = useCallback(() => {
    timerIdRef.current = Date.now();
    roundCountRef.current = 0;
    setRoundCount(0);
    setPhase('active');
    showBlockTimerNotification('AMRAP', time_cap_sec, timerIdRef.current, 'work');
    saveBlockTimer(
      Date.now() + time_cap_sec * 1000, sessionId, 'amrap',
      { time_cap_sec, rounds_logged: 0 }
    ).catch(() => {});
    core.start(time_cap_sec);
  }, [time_cap_sec, sessionId, core]);

  const logRound = useCallback(() => {
    if (phase !== 'active') return;
    const newCount = roundCountRef.current + 1;
    roundCountRef.current = newCount;
    setRoundCount(newCount);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (blockId) {
      logRoundEntry(blockId, newCount - 1, newCount, movements).catch(() => {});
    }
    // Update persisted context
    saveBlockTimer(
      core.endTimeRef.current, sessionId, 'amrap',
      { time_cap_sec, rounds_logged: newCount }
    ).catch(() => {});
  }, [phase, blockId, movements, time_cap_sec, sessionId, core]);

  const pause = useCallback(() => {
    core.pause();
    dismissBlockTimerNotification();
  }, [core]);

  const resume = useCallback(() => {
    core.resume();
    showBlockTimerNotification('AMRAP', core.remaining, timerIdRef.current, 'work');
  }, [core]);

  // Recovery from app kill
  const recover = useCallback(async () => {
    try {
      const saved = await getActiveBlockTimer();
      if (!saved || saved.timer_kind !== 'amrap') return false;
      const ctx = saved.context || {};
      timerIdRef.current = Date.now();
      roundCountRef.current = ctx.rounds_logged || 0;
      setRoundCount(ctx.rounds_logged || 0);
      setPhase('active');
      const stillActive = core.restoreFromEndTime(saved.rest_end_time, ctx.time_cap_sec);
      if (stillActive) {
        showBlockTimerNotification('AMRAP', core.remaining, timerIdRef.current, 'work');
      }
      return true;
    } catch { return false; }
  }, [core]);

  useEffect(() => {
    return () => dismissBlockTimerNotification();
  }, []);

  return {
    roundCount,
    elapsed: core.elapsed,
    remaining: core.remaining,
    timeCap: time_cap_sec,
    phase,
    isRunning: core.isRunning,
    isPaused: !core.isRunning && phase === 'active',
    start,
    logRound,
    pause,
    resume,
    recover,
  };
}
