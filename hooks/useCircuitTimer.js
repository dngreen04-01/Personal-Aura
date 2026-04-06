import { useState, useRef, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import useTimerCore from './useTimerCore';
import { saveBlockTimer, clearRestTimer, getActiveBlockTimer, logRoundEntry, logTimedEffort } from '../lib/database';
import {
  showBlockTimerNotification, dismissBlockTimerNotification,
  stopAlarm, notifee, EventType, ACTION_TIMER_CONTINUE,
} from '../lib/notifications';

/**
 * Circuit timer: station rotation with round tracking.
 *
 * State machine: IDLE → ACTIVE(station, round) → … → COMPLETE
 *
 * Stations can be rep-based (manual advance) or timed (auto-advance via useTimerCore).
 * One full pass through all stations = 1 round. Logged via logRoundEntry per round.
 */
export default function useCircuitTimer({
  sessionId,
  blockId,
  config, // { stations: [{ name, reps?, duration_sec? }], rounds }
  onBlockComplete,
}) {
  const stations = config?.stations || [];
  const totalRounds = config?.rounds || 1;
  const totalStations = stations.length;

  const [stationIndex, setStationIndex] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'active' | 'complete'
  const [isPaused, setIsPaused] = useState(false);

  const stationRef = useRef(0);
  const roundRef = useRef(1);
  const phaseRef = useRef('idle');
  const entryIndexRef = useRef(0);
  const onBlockCompleteRef = useRef(onBlockComplete);
  onBlockCompleteRef.current = onBlockComplete;

  const currentStation = stations[stationIndex] || stations[0] || { name: 'Station' };
  const isTimedStation = currentStation.duration_sec > 0;

  // Timer completion — auto-advance timed stations
  const handleTimerComplete = useCallback(() => {
    if (phaseRef.current !== 'active') return;

    // Log the timed effort for this station
    const station = stations[stationRef.current];
    if (blockId && station?.duration_sec) {
      logTimedEffort(blockId, entryIndexRef.current++, station.duration_sec, {
        station: station.name,
        round: roundRef.current,
      }).catch(e => console.error('[CircuitTimer] Failed to log timed effort:', e));
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    advanceToNextStation();
  }, [blockId, stations]);

  const core = useTimerCore({ onComplete: handleTimerComplete });

  const advanceToNextStation = useCallback(() => {
    const si = stationRef.current;
    const round = roundRef.current;
    const nextSi = si + 1;

    if (nextSi >= totalStations) {
      // Round complete — log round entry
      if (blockId) {
        logRoundEntry(blockId, entryIndexRef.current++, round,
          stations.map(s => ({ name: s.name, reps: s.reps }))
        ).catch(e => console.error('[CircuitTimer] Failed to log round:', e));
      }

      if (round >= totalRounds) {
        // Block complete
        phaseRef.current = 'complete';
        setPhase('complete');
        core.reset();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        dismissBlockTimerNotification();
        clearRestTimer().catch(() => {});
        onBlockCompleteRef.current?.();
      } else {
        // Next round, reset to station 0
        const nextRound = round + 1;
        roundRef.current = nextRound;
        setCurrentRound(nextRound);
        stationRef.current = 0;
        setStationIndex(0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        startStation(0, nextRound);
      }
    } else {
      // Next station in current round
      stationRef.current = nextSi;
      setStationIndex(nextSi);
      startStation(nextSi, round);
    }
  }, [totalStations, totalRounds, blockId, stations, core]);

  const startStation = useCallback((si, round) => {
    const station = stations[si];
    if (!station) return;

    if (station.duration_sec > 0) {
      // Timed station — start countdown
      const label = `${station.name} (Round ${round}/${totalRounds})`;
      showBlockTimerNotification(label, station.duration_sec, Date.now(), 'work');
      saveBlockTimer(
        Date.now() + station.duration_sec * 1000, sessionId, 'circuit',
        { current_station: si, current_round: round, stations_count: totalStations, total_rounds: totalRounds }
      ).catch(() => {});
      core.start(station.duration_sec);
    } else {
      // Rep-based station — waiting for manual advance
      dismissBlockTimerNotification();
      core.reset();
      saveBlockTimer(
        0, sessionId, 'circuit',
        { current_station: si, current_round: round, stations_count: totalStations, total_rounds: totalRounds, rep_based: true }
      ).catch(() => {});
    }
  }, [stations, totalRounds, totalStations, sessionId, core]);

  // --- Public API ---

  const start = useCallback(() => {
    stationRef.current = 0;
    setStationIndex(0);
    roundRef.current = 1;
    setCurrentRound(1);
    entryIndexRef.current = 0;
    phaseRef.current = 'active';
    setPhase('active');
    setIsPaused(false);
    startStation(0, 1);
  }, [startStation]);

  const advanceStation = useCallback(() => {
    // Manual advance for rep-based stations
    if (phaseRef.current !== 'active') return;
    dismissBlockTimerNotification();
    stopAlarm();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    advanceToNextStation();
  }, [advanceToNextStation]);

  const pause = useCallback(() => {
    core.pause();
    setIsPaused(true);
    dismissBlockTimerNotification();
  }, [core]);

  const resume = useCallback(() => {
    core.resume();
    setIsPaused(false);
    const station = stations[stationRef.current];
    if (station?.duration_sec > 0) {
      const label = `${station.name} (Round ${roundRef.current}/${totalRounds})`;
      showBlockTimerNotification(label, core.remaining, Date.now(), 'work');
    }
  }, [core, stations, totalRounds]);

  const skipStation = useCallback(() => {
    if (phaseRef.current !== 'active') return;
    dismissBlockTimerNotification();
    stopAlarm();
    core.reset();
    advanceToNextStation();
  }, [core, advanceToNextStation]);

  // --- Recovery from app kill ---
  const recover = useCallback(async () => {
    try {
      const saved = await getActiveBlockTimer();
      if (!saved || saved.timer_kind !== 'circuit') return false;
      const ctx = saved.context || {};

      stationRef.current = ctx.current_station || 0;
      setStationIndex(ctx.current_station || 0);
      roundRef.current = ctx.current_round || 1;
      setCurrentRound(ctx.current_round || 1);
      phaseRef.current = 'active';
      setPhase('active');

      if (!ctx.rep_based && saved.rest_end_time > 0) {
        const station = stations[ctx.current_station || 0];
        const stillActive = core.restoreFromEndTime(saved.rest_end_time, station?.duration_sec);
        if (stillActive) {
          const label = `${station?.name || 'Station'} (Round ${ctx.current_round || 1}/${ctx.total_rounds || totalRounds})`;
          showBlockTimerNotification(label, core.remaining, Date.now(), 'work');
        }
      }
      return true;
    } catch { return false; }
  }, [core, stations, totalRounds]);

  // --- Notifee foreground action handler ---
  useEffect(() => {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type !== EventType.ACTION_PRESS && type !== EventType.PRESS) return;
      if (detail?.pressAction?.id === ACTION_TIMER_CONTINUE) {
        skipStation();
      }
    });
    return unsub;
  }, [skipStation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => dismissBlockTimerNotification();
  }, []);

  return {
    currentStation,
    stationIndex,
    totalStations,
    currentRound,
    totalRounds,
    remaining: core.remaining,
    elapsed: core.elapsed,
    phase,
    isRunning: core.isRunning,
    isPaused,
    isTimedStation,
    start,
    advanceStation,
    skipStation,
    pause,
    resume,
    recover,
  };
}
