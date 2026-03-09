import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../lib/theme';

export default function PRCard({ exerciseName, prWeight, prDate, improvementPct }) {
  const formattedDate = prDate
    ? new Date(prDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="fitness-center" size={18} color={colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{exerciseName}</Text>
          <Text style={styles.date}>{formattedDate}</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.weight}>{prWeight} kg</Text>
        {improvementPct > 0 && (
          <View style={styles.badge}>
            <MaterialIcons name="arrow-upward" size={10} color={colors.primary} />
            <Text style={styles.badgeText}>{improvementPct}%</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryFaint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1 },
  name: { ...fonts.semibold, fontSize: 14, color: colors.textPrimary },
  date: { ...fonts.regular, fontSize: 12, color: colors.textSecondary },
  right: { alignItems: 'flex-end', gap: 2 },
  weight: { ...fonts.bold, fontSize: 18, color: colors.primary },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 255, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    gap: 2,
  },
  badgeText: { ...fonts.semibold, fontSize: 10, color: colors.primary },
});
