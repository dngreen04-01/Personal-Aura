/**
 * CardioAdapter — renders a cardio block (modality-aware) inside
 * BlockAdapterShell. Three modes:
 *   - Duration-only: countdown timer, logs timed_effort
 *   - Distance-only: manual distance input, logs distance_effort
 *   - Dual (both): countdown timer → distance input on completion, logs both
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import BlockAdapterShell from './BlockAdapterShell';
import TimerDisplay from './TimerDisplay';
import useTimerCore from '../../hooks/useTimerCore';
import { saveBlockTimer, clearRestTimer, getActiveBlockTimer, logTimedEffort, logDistanceEffort } from '../../lib/database';
import { showBlockTimerNotification, dismissBlockTimerNotification } from '../../lib/notifications';
import { colors, spacing, radius, fonts } from '../../lib/theme';

const MODALITY_LABELS = {
  run: 'RUN', row: 'ROW', bike: 'BIKE', ski: 'SKI ERG',
  swim: 'SWIM', walk: 'WALK',
};

export default function CardioAdapter({
  blockPosition,
  blockId,
  sessionId,
  config, // { modality, duration_sec?, target_distance_m? }
  onBlockComplete,
}) {
  const modality = config?.modality || 'cardio';
  const durationSec = config?.duration_sec || 0;
  const targetDistanceM = config?.target_distance_m || 0;
  const hasDuration = durationSec > 0;
  const hasDistance = targetDistanceM > 0;
  const isDualMode = hasDuration && hasDistance;

  // Phases: idle → active (timer) → logging_distance (dual only) → complete
  const [phase, setPhase] = useState('idle');
  const [isPaused, setIsPaused] = useState(false);
  const [actualDistance, setActualDistance] = useState('');
  const [elapsedTime, setElapsedTime] = useState('');
  const phaseRef = useRef('idle');
  const onBlockCompleteRef = useRef(onBlockComplete);
  onBlockCompleteRef.current = onBlockComplete;

  const modalityLabel = MODALITY_LABELS[modality?.toLowerCase()] || modality?.toUpperCase() || 'CARDIO';

  // --- Timer completion ---
  const handleTimerComplete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    dismissBlockTimerNotification();

    // Log the timed effort
    if (blockId) {
      logTimedEffort(blockId, 0, durationSec, { modality }).catch(e => console.error('[CardioAdapter] Failed to log effort:', e));
    }
    clearRestTimer().catch(() => {});

    if (isDualMode) {
      // Dual mode: show distance input instead of completing
      phaseRef.current = 'logging_distance';
      setPhase('logging_distance');
    } else {
      phaseRef.current = 'complete';
      setPhase('complete');
      onBlockCompleteRef.current?.();
    }
  }, [blockId, durationSec, modality, isDualMode]);

  const core = useTimerCore({ onComplete: handleTimerComplete });

  const startTimer = useCallback(() => {
    phaseRef.current = 'active';
    setPhase('active');
    setIsPaused(false);
    showBlockTimerNotification(modalityLabel, durationSec, Date.now(), 'work');
    saveBlockTimer(
      Date.now() + durationSec * 1000, sessionId, 'cardio',
      { modality, duration_sec: durationSec }
    ).catch(() => {});
    core.start(durationSec);
  }, [durationSec, sessionId, core, modalityLabel, modality]);

  const pauseTimer = useCallback(() => {
    core.pause();
    setIsPaused(true);
    dismissBlockTimerNotification();
  }, [core]);

  const resumeTimer = useCallback(() => {
    core.resume();
    setIsPaused(false);
    showBlockTimerNotification(modalityLabel, core.remaining, Date.now(), 'work');
  }, [core, modalityLabel]);

  // --- Distance logging ---
  const parseTimeToSeconds = (str) => {
    if (!str) return 0;
    const parts = str.split(':');
    if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    return parseInt(str, 10) || 0;
  };

  const handleLogDistance = useCallback(() => {
    const distanceM = Math.max(0, parseFloat(actualDistance) || targetDistanceM);
    const elapsedSec = Math.max(0, parseTimeToSeconds(elapsedTime));

    if (blockId) {
      logDistanceEffort(blockId, 1, distanceM, elapsedSec, { modality }).catch(e => console.error('[CardioAdapter] Failed to log distance:', e));
    }
    phaseRef.current = 'complete';
    setPhase('complete');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onBlockCompleteRef.current?.();
  }, [actualDistance, elapsedTime, blockId, targetDistanceM, modality]);

  // Recovery
  useEffect(() => {
    if (!hasDuration) return;
    (async () => {
      try {
        const saved = await getActiveBlockTimer();
        if (!saved || saved.timer_kind !== 'cardio') return;
        const stillActive = core.restoreFromEndTime(saved.rest_end_time, durationSec);
        if (stillActive) {
          phaseRef.current = 'active';
          setPhase('active');
        }
      } catch {}
    })();
  }, []);

  useEffect(() => () => dismissBlockTimerNotification(), []);

  // --- Action resolution ---
  let primaryLabel;
  let primaryAction;
  let primaryDisabled = false;

  if (phase === 'complete') {
    primaryLabel = null;
  } else if (phase === 'logging_distance') {
    primaryLabel = 'LOG DISTANCE';
    primaryAction = handleLogDistance;
    primaryDisabled = !actualDistance.trim();
  } else if (hasDuration) {
    if (phase === 'idle') {
      primaryLabel = 'START';
      primaryAction = startTimer;
    } else if (isPaused) {
      primaryLabel = 'RESUME';
      primaryAction = resumeTimer;
    } else {
      primaryLabel = 'PAUSE';
      primaryAction = pauseTimer;
    }
  } else {
    // Distance-only mode
    primaryLabel = 'LOG DISTANCE';
    primaryAction = handleLogDistance;
    primaryDisabled = !actualDistance.trim();
  }

  const heroLabel = phase === 'complete'
    ? 'COMPLETE'
    : phase === 'logging_distance'
    ? 'LOG YOUR DISTANCE'
    : modalityLabel;

  const formatDistance = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;

  const showDistanceInputs = phase === 'logging_distance' || (!hasDuration && phase !== 'complete');

  return (
    <BlockAdapterShell
      blockPosition={blockPosition}
      heroLabel={heroLabel}
      primaryLabel={primaryLabel}
      onPrimaryAction={primaryAction}
      primaryDisabled={primaryDisabled}
      keepAwake={hasDuration && phase === 'active' && !isPaused}
      accessibilityHint={
        hasDuration
          ? `${modalityLabel} for ${Math.floor(durationSec / 60)} minutes`
          : `${modalityLabel} target: ${formatDistance(targetDistanceM)}`
      }
    >
      {/* Timer display for duration modes */}
      {hasDuration && phase !== 'logging_distance' && phase !== 'complete' ? (
        <>
          <TimerDisplay
            seconds={phase === 'idle' ? durationSec : core.remaining}
            phase="work"
          />
          {isDualMode && phase === 'idle' && (
            <Text style={styles.dualHint}>+ {formatDistance(targetDistanceM)} distance</Text>
          )}
          {isPaused && <Text style={styles.pausedText}>PAUSED</Text>}
        </>
      ) : null}

      {/* Distance inputs for distance-only or dual post-timer */}
      {showDistanceInputs ? (
        <>
          {hasDistance && <Text style={styles.target}>{formatDistance(targetDistanceM)}</Text>}
          <View style={styles.inputGroup}>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Distance (m)</Text>
              <TextInput
                style={styles.input}
                value={actualDistance}
                onChangeText={setActualDistance}
                placeholder={hasDistance ? String(targetDistanceM) : '0'}
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                autoFocus={phase === 'logging_distance'}
              />
            </View>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Time (MM:SS)</Text>
              <TextInput
                style={styles.input}
                value={elapsedTime}
                onChangeText={setElapsedTime}
                placeholder="0:00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
        </>
      ) : null}
    </BlockAdapterShell>
  );
}

const styles = StyleSheet.create({
  target: {
    fontSize: 42,
    ...fonts.extrabold,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  dualHint: {
    marginTop: spacing.sm,
    fontSize: 13,
    ...fonts.medium,
    color: colors.textSecondary,
  },
  inputGroup: {
    width: '100%',
    gap: spacing.md,
  },
  inputRow: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 255, 0, 0.25)',
    backgroundColor: 'rgba(212, 255, 0, 0.06)',
    paddingHorizontal: spacing.md,
    fontSize: 18,
    ...fonts.semibold,
    color: colors.textPrimary,
  },
  pausedText: {
    marginTop: spacing.sm,
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
});
