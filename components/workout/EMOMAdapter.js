/**
 * EMOMAdapter — renders an EMOM block inside BlockAdapterShell.
 * Hero shows seconds remaining in current minute.
 * Movements listed below the timer.
 */
import { View, Text, StyleSheet } from 'react-native';
import BlockAdapterShell from './BlockAdapterShell';
import TimerDisplay from './TimerDisplay';
import useEMOMTimer from '../../hooks/useEMOMTimer';
import { colors, spacing, radius, fonts } from '../../lib/theme';

export default function EMOMAdapter({
  blockPosition,
  blockId,
  sessionId,
  config,
  onBlockComplete,
}) {
  const {
    currentMinute, totalMinutes, remaining, phase, movements,
    isRunning, isPaused,
    start, pause, resume,
  } = useEMOMTimer({ sessionId, blockId, config, onBlockComplete });

  let primaryLabel;
  let primaryAction;

  if (phase === 'idle') {
    primaryLabel = 'START';
    primaryAction = start;
  } else if (isPaused) {
    primaryLabel = 'RESUME';
    primaryAction = resume;
  } else if (phase === 'active') {
    primaryLabel = 'PAUSE';
    primaryAction = pause;
  } else {
    primaryLabel = null;
  }

  const heroLabel = phase === 'complete'
    ? 'COMPLETE'
    : `MINUTE ${currentMinute} OF ${totalMinutes}`;

  return (
    <BlockAdapterShell
      blockPosition={blockPosition}
      heroLabel={heroLabel}
      primaryLabel={primaryLabel}
      onPrimaryAction={primaryAction}
      keepAwake={phase === 'active'}
      accessibilityHint={
        phase === 'idle' ? 'Start EMOM timer'
        : `Minute ${currentMinute} of ${totalMinutes}, ${remaining} seconds remaining`
      }
    >
      <TimerDisplay
        seconds={phase === 'idle' ? 60 : remaining}
        phase="work"
      />
      {movements.length > 0 && (
        <View style={styles.movementList}>
          {movements.map((m, i) => (
            <Text key={i} style={styles.movementItem}>
              {m.reps ? `${m.reps}x ` : ''}{m.name}
            </Text>
          ))}
        </View>
      )}
      {isPaused && <Text style={styles.pausedText}>PAUSED</Text>}
    </BlockAdapterShell>
  );
}

const styles = StyleSheet.create({
  movementList: {
    marginTop: spacing.md,
    gap: spacing.xs,
    alignItems: 'center',
  },
  movementItem: {
    fontSize: 14,
    ...fonts.medium,
    color: colors.textSecondary,
  },
  pausedText: {
    marginTop: spacing.sm,
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
});
