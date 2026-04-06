/**
 * TransitionModal — generalized replacement for BeginSetModal.
 *
 * Five variants (PRD §5 "Modals"):
 *   - begin_set          → between-set rest complete (legacy BeginSetModal)
 *   - next_round         → next round of an interval/amrap/emom block
 *   - next_station       → next station in a circuit block
 *   - exercise_complete  → "all sets of this exercise complete" (legacy transition)
 *   - workout_complete   → final finish state
 *
 * Phase 0: only `begin_set` is fully implemented (maps 1:1 to existing
 * BeginSetModal copy + visuals). Other variants render with their primary
 * label and a neutral hero so they can be wired in Phase 1/2 without
 * touching callers again.
 *
 * The underlying shell is a fade-in Modal with a pulsing glow ring to
 * match the existing Begin Set experience.
 */
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import { colors, spacing, radius, fonts } from '../../lib/theme';

const VARIANTS = {
  begin_set: {
    icon: 'timer',
    headline: 'REST COMPLETE',
    primaryLabel: 'BEGIN SET',
  },
  next_round: {
    icon: 'replay',
    headline: 'ROUND COMPLETE',
    primaryLabel: 'NEXT ROUND',
  },
  next_station: {
    icon: 'move-down',
    headline: 'STATION COMPLETE',
    primaryLabel: 'NEXT STATION',
  },
  exercise_complete: {
    icon: 'check-circle',
    headline: 'ALL SETS COMPLETE',
    primaryLabel: 'NEXT EXERCISE',
  },
  workout_complete: {
    icon: 'emoji-events',
    headline: 'WORKOUT COMPLETE',
    primaryLabel: 'FINISH',
  },
};

export default function TransitionModal({
  visible,
  variant = 'begin_set',
  title,            // primary body text (exercise name, station name, etc)
  subtitle,         // smaller caption under title (set context, round counter)
  primaryLabel,     // override variant default
  onPrimaryAction,
  secondaryLabel,   // e.g. "+15 SECONDS" for begin_set
  onSecondaryAction,
}) {
  const config = VARIANTS[variant] || VARIANTS.begin_set;
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (visible) {
      glowOpacity.value = withRepeat(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      glowOpacity.value = 0.3;
    }
  }, [visible]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.glowRing, glowStyle]} />

        <View style={styles.content}>
          <MaterialIcons name={config.icon} size={40} color={colors.primary} />
          <Text style={styles.headline}>{config.headline}</Text>

          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onPrimaryAction}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel || config.primaryLabel}
          >
            <Text style={styles.primaryButtonText}>{primaryLabel || config.primaryLabel}</Text>
          </TouchableOpacity>

          {secondaryLabel ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onSecondaryAction}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={secondaryLabel}
            >
              <MaterialIcons name="add" size={18} color={colors.primary} />
              <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const MIN_TOUCH = 44;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 20, 8, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 3,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  content: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  headline: {
    fontSize: 14,
    ...fonts.semibold,
    color: colors.primary,
    letterSpacing: 4,
    marginTop: spacing.sm,
  },
  title: {
    fontSize: 24,
    ...fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    ...fonts.medium,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  primaryButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    minWidth: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 18,
    ...fonts.extrabold,
    color: colors.bgDark,
    letterSpacing: 2,
  },
  secondaryButton: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primaryDim,
    backgroundColor: 'rgba(212, 255, 0, 0.05)',
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    fontSize: 14,
    ...fonts.bold,
    color: colors.primary,
    letterSpacing: 1,
  },
});
