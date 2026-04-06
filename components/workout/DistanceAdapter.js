/**
 * DistanceAdapter — renders a distance block (manual input) inside
 * BlockAdapterShell. User enters actual distance achieved and optional time.
 */
import { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import BlockAdapterShell from './BlockAdapterShell';
import { logDistanceEffort } from '../../lib/database';
import { colors, spacing, radius, fonts } from '../../lib/theme';

export default function DistanceAdapter({
  blockPosition,
  blockId,
  sessionId,
  config, // { target_distance_m }
  onBlockComplete,
}) {
  const targetM = config?.target_distance_m || 0;
  const [actualDistance, setActualDistance] = useState('');
  const [elapsedTime, setElapsedTime] = useState('');
  const [phase, setPhase] = useState('idle'); // 'idle' | 'complete'
  const onBlockCompleteRef = useRef(onBlockComplete);
  onBlockCompleteRef.current = onBlockComplete;

  const formatDistance = (m) => {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
    return `${m} m`;
  };

  const parseTimeToSeconds = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    return parseInt(timeStr, 10) || 0;
  };

  const handleLog = useCallback(() => {
    const distanceM = Math.max(0, parseFloat(actualDistance) || targetM);
    const elapsedSec = Math.max(0, parseTimeToSeconds(elapsedTime));

    if (blockId) {
      logDistanceEffort(blockId, 0, distanceM, elapsedSec, null).catch(e => console.error('[DistanceAdapter] Failed to log effort:', e));
    }

    setPhase('complete');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onBlockCompleteRef.current?.();
  }, [actualDistance, elapsedTime, blockId, targetM]);

  const hasInput = actualDistance.trim().length > 0;

  return (
    <BlockAdapterShell
      blockPosition={blockPosition}
      heroLabel={phase === 'complete' ? 'LOGGED' : 'DISTANCE TARGET'}
      primaryLabel={phase === 'complete' ? null : 'LOG DISTANCE'}
      onPrimaryAction={handleLog}
      primaryDisabled={!hasInput}
      keepAwake={false}
      accessibilityHint={`Target distance: ${formatDistance(targetM)}`}
    >
      {/* Target display */}
      <Text style={styles.target}>{formatDistance(targetM)}</Text>

      {phase !== 'complete' && (
        <View style={styles.inputGroup}>
          {/* Actual distance input */}
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Distance (m)</Text>
            <TextInput
              style={styles.input}
              value={actualDistance}
              onChangeText={setActualDistance}
              placeholder={String(targetM)}
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              returnKeyType="next"
            />
          </View>

          {/* Optional elapsed time */}
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Time (MM:SS)</Text>
            <TextInput
              style={styles.input}
              value={elapsedTime}
              onChangeText={setElapsedTime}
              placeholder="0:00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
            />
          </View>
        </View>
      )}
    </BlockAdapterShell>
  );
}

const styles = StyleSheet.create({
  target: {
    fontSize: 42,
    ...fonts.extrabold,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  inputGroup: {
    width: '100%',
    gap: spacing.md,
  },
  inputRow: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 255, 0, 0.25)',
    backgroundColor: 'rgba(212, 255, 0, 0.06)',
    paddingHorizontal: spacing.md,
    fontSize: 18,
    ...fonts.semibold,
    color: colors.textPrimary,
  },
});
