/**
 * BlockNavigator — renders the per-session block progress indicator.
 * Used inside workout.js so users can see where they are in a multi-block
 * session (strength warmup → strength main → amrap finisher, etc).
 *
 * Phase 0: single-strength-block sessions render this as "Exercise X of Y"
 * to match current workout.js copy. Phase 1+ uses real block labels.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../lib/theme';

export default function BlockNavigator({
  currentIndex = 0,
  totalBlocks = 1,
  currentLabel = '',
  onPrev,
  onNext,
  allowPrev = false,
  allowNext = false,
}) {
  return (
    <View style={styles.row} accessibilityRole="header">
      <TouchableOpacity
        onPress={onPrev}
        disabled={!allowPrev}
        style={[styles.navBtn, !allowPrev && styles.navBtnDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Previous block"
        accessibilityState={{ disabled: !allowPrev }}
      >
        <MaterialIcons name="chevron-left" size={24} color={allowPrev ? colors.primary : colors.textSecondary} />
      </TouchableOpacity>

      <View style={styles.center}>
        <Text style={styles.counter}>{currentIndex + 1} / {totalBlocks}</Text>
        {currentLabel ? <Text style={styles.label} numberOfLines={1}>{currentLabel}</Text> : null}
      </View>

      <TouchableOpacity
        onPress={onNext}
        disabled={!allowNext}
        style={[styles.navBtn, !allowNext && styles.navBtnDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Next block"
        accessibilityState={{ disabled: !allowNext }}
      >
        <MaterialIcons name="chevron-right" size={24} color={allowNext ? colors.primary : colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const MIN_TOUCH = 44;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  counter: {
    fontSize: 12,
    ...fonts.bold,
    color: colors.primary,
    letterSpacing: 2,
  },
  label: {
    fontSize: 13,
    ...fonts.medium,
    color: colors.textPrimary,
    marginTop: 2,
    maxWidth: 220,
  },
  navBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  navBtnDisabled: { opacity: 0.4 },
});
