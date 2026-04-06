/**
 * BlockAdapterShell — the shared layout contract that every block adapter
 * (StrengthAdapter, IntervalAdapter, AMRAPTimer, CircuitTracker, ...) renders
 * inside. Gives each block a consistent three-zone skeleton:
 *
 *   ┌─────────────────────────────────────┐
 *   │  Block Position (chip, top)         │
 *   │                                     │
 *   │  ▓▓▓▓▓▓▓▓ Hero Metric ▓▓▓▓▓▓▓▓▓     │  ← the one number the user
 *   │           (children)                │    is tracking this block
 *   │                                     │
 *   │  ┌───────────────────────────────┐  │
 *   │  │      PRIMARY ACTION           │  │  ← single tap to advance
 *   │  └───────────────────────────────┘  │
 *   └─────────────────────────────────────┘
 *
 * Accessibility contract (PRD §5):
 *   - Primary action button minimum 44pt touch target
 *   - Wake-lock active when the block is timer-based (caller opts in via
 *     `keepAwake` prop — strength blocks should NOT set this true)
 */
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { colors, spacing, radius, fonts } from '../../lib/theme';

function useKeepAwakeConditional(active) {
  useEffect(() => {
    if (!active) return undefined;
    activateKeepAwakeAsync('block-timer');
    return () => deactivateKeepAwake('block-timer');
  }, [active]);
}

export default function BlockAdapterShell({
  blockPosition,      // e.g. "Block 2 of 5"
  heroLabel,          // tiny caption above the hero
  children,           // hero metric content (rendered in the center zone)
  primaryLabel,       // text on the primary action button
  onPrimaryAction,    // fires when primary action tapped
  primaryDisabled = false,
  keepAwake = false,  // true for timer-based blocks
  accessibilityHint,
}) {
  useKeepAwakeConditional(keepAwake);

  return (
    <View style={styles.container} accessible accessibilityRole="none">
      {/* Zone 1: block position chip */}
      {blockPosition ? (
        <View style={styles.positionRow}>
          <View style={styles.positionChip}>
            <Text style={styles.positionText}>{blockPosition}</Text>
          </View>
        </View>
      ) : null}

      {/* Zone 2: hero metric */}
      <View style={styles.heroZone}>
        {heroLabel ? <Text style={styles.heroLabel}>{heroLabel}</Text> : null}
        <View style={styles.heroContent}>{children}</View>
      </View>

      {/* Zone 3: primary action */}
      {primaryLabel ? (
        <TouchableOpacity
          style={[styles.primaryAction, primaryDisabled && styles.primaryActionDisabled]}
          onPress={onPrimaryAction}
          disabled={primaryDisabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ disabled: primaryDisabled }}
        >
          <Text style={styles.primaryActionText}>{primaryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const MIN_TOUCH = 44; // PRD §5 minimum touch target

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  positionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primaryDim,
    backgroundColor: 'rgba(212, 255, 0, 0.06)',
  },
  positionText: {
    fontSize: 11,
    ...fonts.bold,
    color: colors.primary,
    letterSpacing: 2,
  },
  heroZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  heroLabel: {
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  heroContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: {
    minHeight: MIN_TOUCH,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionDisabled: {
    backgroundColor: colors.primaryDim,
    opacity: 0.5,
  },
  primaryActionText: {
    fontSize: 16,
    ...fonts.extrabold,
    color: colors.bgDark,
    letterSpacing: 2,
  },
});
