import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../lib/theme';

export default function AchievementBadge({ title, subtitle, icon = 'emoji-events', locked = false }) {
  return (
    <View style={[styles.card, locked && styles.locked]}>
      <View style={[styles.iconWrap, locked && styles.iconLocked]}>
        {locked ? (
          <MaterialIcons name="lock" size={24} color={colors.textSecondary} />
        ) : (
          <MaterialIcons name={icon} size={24} color={colors.primary} />
        )}
      </View>
      <Text style={[styles.title, locked && styles.lockedText]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.subtitle, locked && styles.lockedText]} numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 120,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primaryFaint,
  },
  locked: {
    borderColor: colors.borderLight,
    opacity: 0.5,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryFaint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconLocked: {
    backgroundColor: colors.bgCard,
  },
  title: { ...fonts.semibold, fontSize: 12, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { ...fonts.regular, fontSize: 10, color: colors.textSecondary, textAlign: 'center' },
  lockedText: { color: colors.textSecondary },
});
