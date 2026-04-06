/**
 * CircuitAdapter — renders a circuit block (station rotation with rounds)
 * inside BlockAdapterShell. Handles both timed and rep-based stations.
 */
import { View, Text, StyleSheet } from 'react-native';
import BlockAdapterShell from './BlockAdapterShell';
import TimerDisplay from './TimerDisplay';
import useCircuitTimer from '../../hooks/useCircuitTimer';
import { colors, spacing, fonts } from '../../lib/theme';

export default function CircuitAdapter({
  blockPosition,
  blockId,
  sessionId,
  config,
  onBlockComplete,
}) {
  const {
    currentStation, stationIndex, totalStations,
    currentRound, totalRounds,
    remaining, phase, isRunning, isPaused, isTimedStation,
    start, advanceStation, skipStation, pause, resume,
  } = useCircuitTimer({ sessionId, blockId, config, onBlockComplete });

  let primaryLabel;
  let primaryAction;

  if (phase === 'idle') {
    primaryLabel = 'START';
    primaryAction = start;
  } else if (isPaused) {
    primaryLabel = 'RESUME';
    primaryAction = resume;
  } else if (phase === 'active' && isTimedStation) {
    primaryLabel = 'SKIP STATION';
    primaryAction = skipStation;
  } else if (phase === 'active') {
    primaryLabel = 'STATION COMPLETE';
    primaryAction = advanceStation;
  } else {
    primaryLabel = null;
  }

  const heroLabel = phase === 'complete'
    ? 'COMPLETE'
    : `ROUND ${currentRound} OF ${totalRounds}`;

  const stationLabel = `STATION ${stationIndex + 1} OF ${totalStations}`;

  return (
    <BlockAdapterShell
      blockPosition={blockPosition}
      heroLabel={heroLabel}
      primaryLabel={primaryLabel}
      onPrimaryAction={primaryAction}
      keepAwake={phase === 'active'}
      accessibilityHint={
        phase === 'idle' ? 'Start circuit'
        : `${currentStation.name}, station ${stationIndex + 1} of ${totalStations}, round ${currentRound} of ${totalRounds}`
      }
    >
      {/* Station name */}
      <Text style={styles.stationName}>{currentStation.name}</Text>

      {/* Timer for timed stations, rep target for rep-based */}
      {phase !== 'idle' && isTimedStation ? (
        <TimerDisplay seconds={remaining} phase="work" />
      ) : currentStation.reps ? (
        <Text style={styles.repTarget}>{currentStation.reps} reps</Text>
      ) : null}

      {/* Station counter */}
      {phase !== 'idle' && phase !== 'complete' && (
        <View style={styles.stationChip}>
          <Text style={styles.stationChipText}>{stationLabel}</Text>
        </View>
      )}

      {isPaused && <Text style={styles.pausedText}>PAUSED</Text>}
    </BlockAdapterShell>
  );
}

const styles = StyleSheet.create({
  stationName: {
    fontSize: 24,
    ...fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  repTarget: {
    fontSize: 36,
    ...fonts.extrabold,
    color: colors.primary,
  },
  stationChip: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  stationChipText: {
    fontSize: 11,
    ...fonts.bold,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  pausedText: {
    marginTop: spacing.sm,
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
});
