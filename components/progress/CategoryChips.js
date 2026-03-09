import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fonts } from '../../lib/theme';

export default function CategoryChips({ categories, activeCategory, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {categories.map((cat) => {
        const isActive = activeCategory === cat;
        return (
          <TouchableOpacity
            key={cat}
            style={[styles.chip, isActive && styles.activeChip]}
            onPress={() => onSelect(cat)}
          >
            <Text style={[styles.chipText, isActive && styles.activeChipText]}>
              {cat}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.bgCard,
  },
  activeChip: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  activeChipText: {
    color: colors.bgDark,
  },
});
