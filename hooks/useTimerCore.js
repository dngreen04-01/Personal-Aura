import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';

/**
 * Core countdown/countup engine shared by all timer-based hooks.
 *
 * Handles:
 *  - 250ms tick loop with absolute end-time reference (drift-resistant)
 *  - Pause / resume with remaining-time preservation
 *  - AppState foreground recalculation
 *  - App-kill recovery via restoreFromEndTime()
 *
 * Does NOT handle: alarms, notifications, SQLite persistence, modal state.
 * Those responsibilities belong to the caller (useRestTimer, useIntervalTimer, etc.).
 */
export default function useTimerCore({ onComplete, onTick } = {}) {
  const [remaining, setRemaining] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const endTimeRef = useRef(null);
  const startTimeRef = useRef(null);
  const durationRef = useRef(0);
  const pausedRemainingRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const onTickRef = useRef(onTick);

  // Keep callback refs in sync without causing effect re-runs
  onCompleteRef.current = onComplete;
  onTickRef.current = onTick;

  const fireComplete = useCallback(() => {
    setIsRunning(false);
    setRemaining(0);
    setElapsed(durationRef.current);
    endTimeRef.current = null;
    onCompleteRef.current?.();
  }, []);

  const start = useCallback((durationSec) => {
    const now = Date.now();
    startTimeRef.current = now;
    durationRef.current = durationSec;
    endTimeRef.current = now + durationSec * 1000;
    pausedRemainingRef.current = 0;
    setIsRunning(true);
    setRemaining(durationSec);
    setElapsed(0);
  }, []);

  const pause = useCallback(() => {
    if (!endTimeRef.current) return;
    const rem = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
    pausedRemainingRef.current = rem;
    endTimeRef.current = null;
    setIsRunning(false);
  }, []);

  const resume = useCallback(() => {
    const rem = pausedRemainingRef.current;
    if (rem <= 0) return;
    const now = Date.now();
    endTimeRef.current = now + rem * 1000;
    // Adjust start time so elapsed stays correct
    startTimeRef.current = now - (durationRef.current - rem) * 1000;
    pausedRemainingRef.current = 0;
    setIsRunning(true);
  }, []);

  const reset = useCallback(() => {
    endTimeRef.current = null;
    startTimeRef.current = null;
    pausedRemainingRef.current = 0;
    setIsRunning(false);
    setRemaining(0);
    setElapsed(0);
  }, []);

  /**
   * Restore from a persisted absolute end time (for app-kill recovery).
   * Returns true if the timer is still active, false if it already expired.
   */
  const restoreFromEndTime = useCallback((endTimeMs, originalDurationSec) => {
    const now = Date.now();
    const rem = Math.max(0, Math.ceil((endTimeMs - now) / 1000));
    durationRef.current = originalDurationSec || rem;
    if (rem > 0) {
      endTimeRef.current = endTimeMs;
      startTimeRef.current = now - (durationRef.current - rem) * 1000;
      setIsRunning(true);
      setRemaining(rem);
      setElapsed(Math.max(0, durationRef.current - rem));
      return true;
    }
    fireComplete();
    return false;
  }, [fireComplete]);

  // --- 250ms countdown interval ---
  useEffect(() => {
    if (!isRunning || !endTimeRef.current) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const rem = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
      const elap = startTimeRef.current
        ? Math.floor((now - startTimeRef.current) / 1000)
        : 0;
      if (rem <= 0) {
        clearInterval(interval);
        fireComplete();
      } else {
        setRemaining(rem);
        setElapsed(elap);
        onTickRef.current?.(rem, elap);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [isRunning, fireComplete]);

  // --- AppState: recalculate on foreground return ---
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isRunning && endTimeRef.current) {
        const rem = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
        if (rem <= 0) {
          fireComplete();
        } else {
          setRemaining(rem);
        }
      }
    });
    return () => sub.remove();
  }, [isRunning, fireComplete]);

  return {
    remaining,
    elapsed,
    isRunning,
    start,
    pause,
    resume,
    reset,
    restoreFromEndTime,
    endTimeRef, // exposed for callers that need the raw end time for persistence
  };
}
