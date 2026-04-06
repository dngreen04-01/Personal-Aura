import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { saveRestTimer, clearRestTimer, getActiveRestTimer, saveSessionState } from '../lib/database';
import { showTimerNotification, scheduleAlarmNotification, fireAlarmNow, stopAlarm, cancelAll, notifee, EventType, ACTION_BEGIN_SET, ACTION_EXTEND_15S } from '../lib/notifications';

/**
 * Manages the rest timer lifecycle: countdown, persistence across app kills,
 * alarm firing, Begin Set modal, +15s extend, AppState transitions, and
 * notification action handling.
 */
export default function useRestTimer({
  sessionId,
  currentExercise,
  currentSet,
  totalSets,
  currentExIdx,
  totalExercises,
  restDuration,
  day,
  completedExercises,
  exerciseSets,
  onTimerRecoveryAlarm,
}) {
  const [isResting, setIsResting] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const [alarmFired, setAlarmFired] = useState(false);

  const restEndTimeRef = useRef(null);
  const pendingAdvanceRef = useRef(null);
  const restIdRef = useRef(null);
  const alarmSoundCapRef = useRef(null);

  // --- Rest complete: fire alarm & show Begin Set modal ---
  const completeRest = useCallback(() => {
    setIsResting(false);
    setRestRemaining(0);
    restEndTimeRef.current = null;
    setAlarmFired(true);
    fireAlarmNow(restIdRef.current);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    alarmSoundCapRef.current = setTimeout(() => stopAlarm(), 300000);
    clearRestTimer().catch(() => {});
  }, []);

  // --- User taps "Begin Set" ---
  const handleBeginSet = useCallback(() => {
    if (alarmSoundCapRef.current) { clearTimeout(alarmSoundCapRef.current); alarmSoundCapRef.current = null; }
    stopAlarm();
    cancelAll();
    clearRestTimer().catch(() => {});
    setAlarmFired(false);
    const advance = pendingAdvanceRef.current;
    pendingAdvanceRef.current = null;
    if (advance) advance();
  }, []);

  // --- User taps "+15 seconds" ---
  const handleExtendRest = useCallback(() => {
    if (alarmSoundCapRef.current) { clearTimeout(alarmSoundCapRef.current); alarmSoundCapRef.current = null; }
    stopAlarm();
    cancelAll();
    setAlarmFired(false);
    restEndTimeRef.current = Date.now() + 15000;
    setIsResting(true);
    setRestRemaining(15);
    showTimerNotification(currentExercise?.name || 'Rest', 15, restIdRef.current);
    scheduleAlarmNotification(15, restIdRef.current);
    saveRestTimer(restEndTimeRef.current, sessionId, currentExercise?.name || '', currentSet, totalSets, currentExIdx, totalExercises, restIdRef.current).catch(() => {});
  }, [currentExercise, sessionId, currentSet, totalSets, currentExIdx, totalExercises]);

  // --- Skip rest ---
  const handleSkipRest = useCallback(() => {
    if (alarmSoundCapRef.current) { clearTimeout(alarmSoundCapRef.current); alarmSoundCapRef.current = null; }
    restEndTimeRef.current = null;
    cancelAll();
    clearRestTimer().catch(() => {});
    setAlarmFired(false);
    const advance = pendingAdvanceRef.current;
    pendingAdvanceRef.current = null;
    setIsResting(false);
    setRestRemaining(0);
    if (advance) advance();
  }, []);

  // --- Start a new rest period ---
  const startRest = useCallback((exerciseName, duration, afterRestCallback) => {
    restIdRef.current = Date.now();
    restEndTimeRef.current = restIdRef.current + duration * 1000;
    setIsResting(true);
    setRestRemaining(duration);
    showTimerNotification(exerciseName, duration, restIdRef.current);
    scheduleAlarmNotification(duration, restIdRef.current);
    saveRestTimer(restEndTimeRef.current, sessionId, exerciseName, currentSet, totalSets, currentExIdx, totalExercises, restIdRef.current).catch(() => {});
    if (afterRestCallback) {
      pendingAdvanceRef.current = afterRestCallback;
    } else {
      pendingAdvanceRef.current = null;
    }
  }, [sessionId, currentSet, totalSets, currentExIdx, totalExercises]);

  // --- 250ms countdown interval ---
  useEffect(() => {
    if (!isResting || !restEndTimeRef.current) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((restEndTimeRef.current - Date.now()) / 1000));
      if (remaining <= 0) {
        completeRest();
      } else {
        setRestRemaining(remaining);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [isResting, completeRest]);

  // --- AppState listener: foreground/background ---
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (sessionId && day) {
          saveSessionState(sessionId, day, {
            currentExIdx,
            currentSet,
            completedExercises: Array.from(completedExercises),
            exerciseSets,
          }).catch(() => {});
        }
      }
      if (nextState === 'active') {
        if (alarmFired) {
          cancelAll();
          return;
        }
        if (restEndTimeRef.current) {
          const remaining = Math.max(0, Math.ceil((restEndTimeRef.current - Date.now()) / 1000));
          if (remaining <= 0) {
            completeRest();
          } else {
            setRestRemaining(remaining);
            setIsResting(true);
          }
        }
      }
    });
    return () => sub.remove();
  }, [completeRest, alarmFired, sessionId, day, currentExIdx, currentSet, completedExercises, exerciseSets]);

  // --- Notifee foreground action handler ---
  useEffect(() => {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type !== EventType.ACTION_PRESS && type !== EventType.PRESS) return;
      const actionId = detail?.pressAction?.id;
      const notifRestId = detail?.notification?.data?.restId;
      if (notifRestId && restIdRef.current && String(notifRestId) !== String(restIdRef.current)) return;

      if (actionId === ACTION_BEGIN_SET || (type === EventType.PRESS && alarmFired)) {
        handleBeginSet();
      } else if (actionId === ACTION_EXTEND_15S) {
        handleExtendRest();
      }
    });
    return unsub;
  }, [handleBeginSet, handleExtendRest, alarmFired]);

  // --- Timer recovery on mount ---
  const recoverTimer = useCallback(async () => {
    try {
      const saved = await getActiveRestTimer();
      if (saved) {
        const remaining = Math.max(0, Math.ceil((saved.rest_end_time - Date.now()) / 1000));
        restIdRef.current = saved.rest_id;
        if (remaining > 0) {
          restEndTimeRef.current = saved.rest_end_time;
          setIsResting(true);
          setRestRemaining(remaining);
          showTimerNotification(saved.exercise_name || 'Rest', remaining, saved.rest_id);
          scheduleAlarmNotification(remaining, saved.rest_id);
        } else {
          setAlarmFired(true);
          fireAlarmNow(saved.rest_id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          alarmSoundCapRef.current = setTimeout(() => stopAlarm(), 300000);
        }
      }
    } catch {}
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (alarmSoundCapRef.current) clearTimeout(alarmSoundCapRef.current);
      cancelAll();
    };
  }, []);

  return {
    isResting,
    restRemaining,
    alarmFired,
    startRest,
    handleBeginSet,
    handleExtendRest,
    handleSkipRest,
    recoverTimer,
    pendingAdvanceRef,
  };
}
