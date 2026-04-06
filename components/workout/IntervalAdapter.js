/**
 * IntervalAdapter — renders an interval block (work/rest cycles) inside
 * BlockAdapterShell. Hero zone displays the countdown clock with phase
 * indicator. Primary action toggles between START, SKIP WORK, and SKIP REST.
 */
import { View, Text, StyleSheet } from 'react-native';
import BlockAdapterShell from './BlockAdapterShell';
import TimerDisplay from './TimerDisplay';
import useIntervalTimer from '../../hooks/useIntervalTimer';
import { colors, spacing, radius, fonts } from '../../lib/theme';

export default function IntervalAdapter({
  blockPosition,
  blockId,
  sessionId,
  config, // { work_sec, rest_sec, rounds }
  onBlockComplete,
}) {
  const {
    currentRound, totalRounds, phase, remaining,
    isRunning, isPaused,
    start, pause, resume, skipPhase,
  } = useIntervalTimer({ sessionId, blockId, config, onBlockComplete });

  // Determine primary action label and handler
  let primaryLabel;
  let primaryAction;
  let primaryDisabled = false;

  if (phase === 'idle') {
    primaryLabel = 'START';
    primaryAction = start;
  } else if (isPaused) {
    primaryLabel = 'RESUME';
    primaryAction = resume;
  } else if (phase === 'work') {
    primaryLabel = 'SKIP WORK';
    primaryAction = skipPhase;
  } else if (phase === 'rest') {
    primaryLabel = 'SKIP REST';
    primaryAction = skipPhase;
  } else if (phase === 'complete') {
    primaryLabel = null; // TransitionModal takes over
    primaryDisabled = true;
  }

  const roundLabel = phase === 'complete'
    ? 'COMPLETE'
    : `ROUND ${currentRound} OF ${totalRounds}`;

  const phaseLabel = phase === 'work' ? 'WORK' : phase === 'rest' ? 'REST' : null;
  const phaseColor = phase === 'work' ? colors.primary : colors.textSecondary;

  return (
    <BlockAdapterShell
      blockPosition={blockPosition}
      heroLabel={roundLabel}
      primaryLabel={primaryLabel}
      onPrimaryAction={primaryAction}
      primaryDisabled={primaryDisabled}
      keepAwake={phase === 'work' || phase === 'rest'}
      accessibilityHint={
        phase === 'idle' ? 'Start interval timer'
        : `${phase} phase, ${remaining} seconds remaining, round ${currentRound} of ${totalRounds}`
      }
    >
      <TimerDisplay
        seconds={phase === 'idle' ? config?.work_sec || 0 : remaining}
        phase={phase === 'idle' ? 'work' : phase}
      />
      {phaseLabel ? (
        <View style={[styles.phaseChip, { borderColor: phaseColor }]}>
          <Text style={[styles.phaseText, { color: phaseColor }]}>{phaseLabel}</Text>
        </View>
      ) : null}
      {isPaused ? (
        <Text style={styles.pausedText}>PAUSED</Text>
      ) : null}
    </BlockAdapterShell>
  );
}

const styles = StyleSheet.create({
  phaseChip: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  phaseText: {
    fontSize: 12,
    ...fonts.bold,
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
