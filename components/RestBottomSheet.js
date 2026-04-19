import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing, radius } from '../lib/theme';

export default function RestBottomSheet({
  secondsLeft,
  totalSeconds,
  nextSetNum,
  totalSets,
  exerciseName,
  onExtend,
  onSkip,
}) {
  const size = 64;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  const offset = c * (1 - pct);
  const mins = Math.floor(Math.max(0, secondsLeft) / 60);
  const secs = Math.max(0, secondsLeft) % 60;
  const timeText = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />

      <View style={styles.row}>
        <View style={styles.ringWrap}>
          <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colors.borderLight}
              strokeWidth={stroke}
              fill="none"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colors.primary}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </Svg>
          <View style={styles.ringText}>
            <Text style={styles.timeText}>{timeText}</Text>
          </View>
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.label}>RESTING</Text>
          <Text style={styles.title}>Up: Set {nextSetNum} of {totalSets}</Text>
          <Text style={styles.exercise} numberOfLines={1}>{exerciseName}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onExtend} activeOpacity={0.8}>
          <Text style={styles.btnSecondaryText}>+15s</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onSkip} activeOpacity={0.9}>
          <Text style={styles.btnPrimaryText}>Skip rest · Begin set</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgDark,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderLight,
    alignSelf: 'center',
    marginBottom: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ringWrap: { width: 64, height: 64, justifyContent: 'center', alignItems: 'center' },
  ringText: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  timeText: {
    fontSize: 16,
    fontFamily: 'Inter_800ExtraBold',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  textBlock: { flex: 1 },
  label: {
    fontSize: 10,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 2,
    color: colors.textMuted,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
    marginTop: 2,
  },
  exercise: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: colors.textSecondary,
    marginTop: 2,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: {
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: colors.bgCardSolid,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
  },
  btnPrimary: {
    flex: 2,
    backgroundColor: colors.primary,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: colors.bgDark,
  },
});
