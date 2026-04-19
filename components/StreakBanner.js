import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../lib/theme';

export default function StreakBanner({ streak = 0, weekCompleted = 0, weekTotal = 0 }) {
  if (streak <= 0 && weekCompleted <= 0) return null;

  const onFire = streak >= 7;
  const badgeText = onFire ? 'ON FIRE' : 'ACTIVE';

  return (
    <View style={styles.banner}>
      <MaterialIcons name="local-fire-department" size={18} color={colors.primary} />
      <View style={styles.textWrap}>
        <Text style={styles.text}>
          {streak > 0 ? `${streak}-day streak` : 'Building momentum'}
          {weekTotal > 0 ? ` · ${weekCompleted}/${weekTotal} this week` : ''}
        </Text>
      </View>
      <Text style={styles.badge}>{badgeText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primaryFaint,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 14,
  },
  textWrap: { flex: 1 },
  text: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textPrimary,
  },
  badge: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    letterSpacing: 1,
  },
});
