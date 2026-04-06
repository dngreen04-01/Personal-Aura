/**
 * UnsupportedBlockFallback — shown when a block type is not yet implemented.
 * Prevents crashes if the Planning Agent emits a block type without a matching adapter.
 */
import { Text, StyleSheet } from 'react-native';
import BlockAdapterShell from './BlockAdapterShell';
import { colors, fonts, spacing } from '../../lib/theme';

export default function UnsupportedBlockFallback({ blockType, blockLabel, blockPosition, onSkip }) {
  return (
    <BlockAdapterShell
      blockPosition={blockPosition}
      heroLabel={blockLabel || blockType?.toUpperCase()}
      primaryLabel="SKIP"
      onPrimaryAction={onSkip}
      accessibilityHint={`Skip unsupported ${blockType} block`}
    >
      <Text style={styles.message}>
        This block type is not yet supported.{'\n'}Skip to continue your workout.
      </Text>
    </BlockAdapterShell>
  );
}

const styles = StyleSheet.create({
  message: {
    fontSize: 14,
    ...fonts.medium,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
});
