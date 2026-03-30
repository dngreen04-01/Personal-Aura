import { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, radius, fonts } from '../lib/theme';

export default function BeginSetModal({
  visible,
  exerciseName,
  setNumber,
  totalSets,
  isLastSet,
  onBeginSet,
  onExtend,
}) {
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

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        {/* Pulsing glow ring */}
        <Animated.View style={[styles.glowRing, glowStyle]} />

        <View style={styles.content}>
          <MaterialIcons name="timer" size={40} color={colors.primary} />

          <Text style={styles.label}>REST COMPLETE</Text>

          <Text style={styles.exerciseName}>{exerciseName}</Text>
          <Text style={styles.setContext}>
            {isLastSet ? 'FINAL SET' : `SET ${setNumber} OF ${totalSets}`}
          </Text>

          {/* Begin Set / Complete Workout button */}
          <TouchableOpacity
            style={styles.beginButton}
            onPress={onBeginSet}
            activeOpacity={0.85}
          >
            <Text style={styles.beginButtonText}>
              {isLastSet ? 'COMPLETE WORKOUT' : 'BEGIN SET'}
            </Text>
          </TouchableOpacity>

          {/* +15 seconds button */}
          <TouchableOpacity
            style={styles.extendButton}
            onPress={onExtend}
            activeOpacity={0.7}
          >
            <MaterialIcons name="add" size={18} color={colors.primary} />
            <Text style={styles.extendButtonText}>15 SECONDS</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

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
  label: {
    fontSize: 14,
    ...fonts.semibold,
    color: colors.primary,
    letterSpacing: 4,
    marginTop: spacing.sm,
  },
  exerciseName: {
    fontSize: 24,
    ...fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  setContext: {
    fontSize: 13,
    ...fonts.medium,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  beginButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    minWidth: 240,
    alignItems: 'center',
  },
  beginButtonText: {
    fontSize: 18,
    ...fonts.extrabold,
    color: colors.bgDark,
    letterSpacing: 2,
  },
  extendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primaryDim,
    backgroundColor: 'rgba(212, 255, 0, 0.05)',
    marginTop: spacing.sm,
  },
  extendButtonText: {
    fontSize: 14,
    ...fonts.bold,
    color: colors.primary,
    letterSpacing: 1,
  },
});
