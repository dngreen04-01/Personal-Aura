/**
 * StrengthAdapter — renders a strength block inside a BlockAdapterShell.
 *
 * Phase 0 scope: this is the layout-contract scaffold that Phase 1 will
 * migrate the existing set-logging UI into. The current workout.js is the
 * temporary authority for live strength sessions — this adapter documents
 * the target shape without rerouting live traffic yet.
 *
 * Hero zone displays weight × reps; primary action is the "Log Set" button.
 * Caller owns the session state and wires onLogSet to the real DB helper.
 */
import { View, Text, StyleSheet } from 'react-native';
import BlockAdapterShell from './BlockAdapterShell';
import { colors, spacing, fonts } from '../../lib/theme';

export default function StrengthAdapter({
  blockPosition,
  exerciseName,
  setNumber,
  totalSets,
  weight,
  weightUnit = 'kg',
  reps,
  onLogSet,
  disabled = false,
}) {
  const setLabel = totalSets ? `SET ${setNumber} OF ${totalSets}` : `SET ${setNumber}`;
  return (
    <BlockAdapterShell
      blockPosition={blockPosition}
      heroLabel={setLabel}
      primaryLabel="LOG SET"
      onPrimaryAction={onLogSet}
      primaryDisabled={disabled}
      accessibilityHint={`Log ${weight} ${weightUnit} for ${reps} reps`}
    >
      <Text style={styles.exerciseName} numberOfLines={2}>{exerciseName}</Text>
      <View style={styles.metricRow}>
        <Text style={styles.metricValue}>{weight ?? '—'}</Text>
        <Text style={styles.metricUnit}>{weightUnit}</Text>
        <Text style={styles.metricSeparator}>×</Text>
        <Text style={styles.metricValue}>{reps ?? '—'}</Text>
        <Text style={styles.metricUnit}>reps</Text>
      </View>
    </BlockAdapterShell>
  );
}

const styles = StyleSheet.create({
  exerciseName: {
    fontSize: 22,
    ...fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  metricValue: {
    fontSize: 56,
    ...fonts.extrabold,
    color: colors.primary,
  },
  metricUnit: {
    fontSize: 16,
    ...fonts.medium,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  metricSeparator: {
    fontSize: 28,
    ...fonts.bold,
    color: colors.textSecondary,
    marginHorizontal: spacing.sm,
  },
});
