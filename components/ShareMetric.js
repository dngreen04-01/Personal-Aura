import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../lib/theme';

export default function ShareMetric({ label, value, unit, align = 'left' }) {
  const alignItems = align === 'right' ? 'flex-end' : 'flex-start';
  const textAlign = align === 'right' ? 'right' : 'left';
  return (
    <View style={{ alignItems }}>
      <Text style={[styles.label, { textAlign }]}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 9,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 1.5,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  value: {
    fontSize: 22,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: -0.5,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    lineHeight: 22,
  },
  unit: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textSecondary,
  },
});
