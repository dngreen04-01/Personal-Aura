import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '../../lib/theme';

/**
 * Shared countdown/countup display used by all timer adapters.
 * Renders large MM:SS digits with phase-aware coloring.
 */
export default function TimerDisplay({ seconds, phase, label }) {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const digitColor = phase === 'rest' ? colors.textSecondary : colors.primary;

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Text
        style={[styles.digits, { color: digitColor }]}
        accessibilityLabel={`${mins} minutes ${secs} seconds`}
        accessibilityRole="timer"
      >
        {display}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  digits: {
    fontSize: 56,
    ...fonts.extrabold,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
});
