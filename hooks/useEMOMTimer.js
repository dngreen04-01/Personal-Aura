import { useState, useRef, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import useTimerCore from './useTimerCore';
import { saveBlockTimer, clearRestTimer, getActiveBlockTimer, logTimedEffort } from '../lib/database';
import { showBlockTimerNotification, dismissBlockTimerNotification } from '../lib/notifications';

/**
 * EMOM timer: every minute on the minute.
 * Counts down per minute, auto-advances rounds.
 *
 * Built on useTimerCore — each minute is a separate countdown.
 */
export default function useEMOMTimer({
  sessionId,
  blockId,
  config, // { minutes, movements }
  onBlockComplete,
}) {
  const { minutes = 10, movements = [] } = config || {};

  const [currentMinute, setCurrentMinute] = useState(1);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'active' | 'complete'

  const timerIdRef = useRef(null);
  const minuteRef = useRef(1);
  const onBlockCompleteRef = useRef(onBlockComplete);
  onBlockCompleteRef.current = onBlockComplete;

  const handleMinuteComplete = useCallback(() => {
    const min = minuteRef.current;

    // Log the completed minute
    if (blockId) {
      logTimedEffort(blockId, min - 1, 60, { minute: min }).catch(() => {});
    }

    if (min >= minutes) {
      // Block complete
      setPhase('complete');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dismissBlockTimerNotification();
      clearRestTimer().catch(() => {});
      onBlockCompleteRef.current?.();
    } else {
      // Next minute
      const nextMin = min + 1;
      minuteRef.current = nextMin;
      setCurrentMinute(nextMin);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showBlockTimerNotification(`Minute ${nextMin} of ${minutes}`, 60, timerIdRef.current, 'work');
      saveBlockTimer(
        Date.now() + 60_000, sessionId, 'emom',
        { minutes, current_minute: nextMin }
      ).catch(() => {});
      core.start(60);
    }
  }, [blockId, minutes, sessionId]);

  const core = useTimerCore({ onComplete: handleMinuteComplete });

  const start = useCallback(() => {
    timerIdRef.current = Date.now();
    minuteRef.current = 1;
    setCurrentMinute(1);
    setPhase('active');
    showBlockTimerNotification(`Minute 1 of ${minutes}`, 60, timerIdRef.current, 'work');
    saveBlockTimer(
      Date.now() + 60_000, sessionId, 'emom',
      { minutes, current_minute: 1 }
    ).catch(() => {});
    core.start(60);
  }, [minutes, sessionId, core]);

  const pause = useCallback(() => {
    core.pause();
    dismissBlockTimerNotification();
  }, [core]);

  const resume = useCallback(() => {
    core.resume();
    showBlockTimerNotification(
      `Minute ${minuteRef.current} of ${minutes}`, core.remaining, timerIdRef.current, 'work'
    );
  }, [core, minutes]);

  // Recovery from app kill
  const recover = useCallback(async () => {
    try {
      const saved = await getActiveBlockTimer();
      if (!saved || saved.timer_kind !== 'emom') return false;
      const ctx = saved.context || {};
      timerIdRef.current = Date.now();
      minuteRef.current = ctx.current_minute || 1;
      setCurrentMinute(ctx.current_minute || 1);
      setPhase('active');
      const stillActive = core.restoreFromEndTime(saved.rest_end_time, 60);
      if (stillActive) {
        showBlockTimerNotification(
          `Minute ${ctx.current_minute || 1} of ${ctx.minutes || minutes}`,
          core.remaining, timerIdRef.current, 'work'
        );
      }
      return true;
    } catch { return false; }
  }, [core, minutes]);

  useEffect(() => {
    return () => dismissBlockTimerNotification();
  }, []);

  return {
    currentMinute,
    totalMinutes: minutes,
    remaining: core.remaining,
    phase,
    isRunning: core.isRunning,
    isPaused: !core.isRunning && phase === 'active',
    movements,
    start,
    pause,
    resume,
    recover,
  };
}
