/**
 * AMRAPAdapter — renders an AMRAP block inside BlockAdapterShell.
 * Hero shows elapsed / cap timer. Manual LOG ROUND button.
 */
import { View, Text, StyleSheet } from 'react-native';
import BlockAdapterShell from './BlockAdapterShell';
import TimerDisplay from './TimerDisplay';
import useAMRAPTimer from '../../hooks/useAMRAPTimer';
import { colors, spacing, radius, fonts } from '../../lib/theme';

export default function AMRAPAdapter({
  blockPosition,
  blockId,
  sessionId,
  config,
  onBlockComplete,
}) {
  const {
    roundCount, elapsed, remaining, timeCap, phase,
    isRunning, isPaused,
    start, logRound, pause, resume,
  } = useAMRAPTimer({ sessionId, blockId, config, onBlockComplete });

  let primaryLabel;
  let primaryAction;

  if (phase === 'idle') {
    primaryLabel = 'START';
    primaryAction = start;
  } else if (isPaused) {
    primaryLabel = 'RESUME';
    primaryAction = resume;
  } else if (phase === 'active') {
    primaryLabel = 'LOG ROUND';
    primaryAction = logRound;
  } else {
    primaryLabel = null;
  }

  const mins = Math.floor(timeCap / 60);
  const heroLabel = phase === 'complete' ? 'COMPLETE' : `AMRAP ${mins} MIN`;

  return (
    <BlockAdapterShell
      blockPosition={blockPosition}
      heroLabel={heroLabel}
      primaryLabel={primaryLabel}
      onPrimaryAction={primaryAction}
      keepAwake={phase === 'active'}
      accessibilityHint={
        phase === 'idle' ? 'Start AMRAP timer'
        : `${roundCount} rounds logged, ${remaining} seconds remaining`
      }
    >
      <TimerDisplay
        seconds={phase === 'idle' ? timeCap : remaining}
        phase="work"
      />
      <View style={styles.roundRow}>
        <Text style={styles.roundCount}>{roundCount}</Text>
        <Text style={styles.roundLabel}>ROUNDS</Text>
      </View>
      {isPaused && <Text style={styles.pausedText}>PAUSED</Text>}
    </BlockAdapterShell>
  );
}

const styles = StyleSheet.create({
  roundRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  roundCount: {
    fontSize: 36,
    ...fonts.extrabold,
    color: colors.textPrimary,
  },
  roundLabel: {
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 3,
  },
  pausedText: {
    marginTop: spacing.sm,
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
});
