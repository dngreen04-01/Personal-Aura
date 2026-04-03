import { useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSpring, Easing, FadeIn, SlideInDown,
} from 'react-native-reanimated';
import { colors, spacing, radius, fonts } from '../lib/theme';

export default function ExerciseHub({
  visible,
  exercises,
  completedExercises,
  exerciseSets,
  suggestedNextIdx,
  onSelectExercise,
}) {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      pulseScale.value = withRepeat(
        withTiming(1.02, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      pulseScale.value = 1;
    }
  }, [visible]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  if (!visible) return null;

  const completedCount = completedExercises.size;
  const totalCount = exercises.length;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <Animated.View entering={SlideInDown.springify().damping(18)} style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerBadge}>
              <MaterialIcons name="fitness-center" size={16} color={colors.bgDark} />
            </View>
            <Text style={styles.headerTitle}>EXERCISE COMPLETE</Text>
            <Text style={styles.headerSub}>
              {completedCount} of {totalCount} exercises done
            </Text>
          </View>

          {/* Exercise List */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {exercises.map((ex, i) => {
              const isCompleted = completedExercises.has(i);
              const setsLogged = exerciseSets[i] || 0;
              const isPartial = !isCompleted && setsLogged > 0;
              const isSuggested = i === suggestedNextIdx;
              const totalSets = parseInt(ex.sets) || 4;

              return (
                <Animated.View
                  key={`${ex.name}-${i}`}
                  entering={FadeIn.delay(i * 60).duration(300)}
                >
                  <TouchableOpacity
                    style={[
                      styles.exerciseCard,
                      isCompleted && styles.exerciseCardCompleted,
                      isSuggested && styles.exerciseCardSuggested,
                    ]}
                    onPress={() => onSelectExercise(i)}
                    activeOpacity={0.7}
                  >
                    {/* Status indicator */}
                    <View style={[
                      styles.statusDot,
                      isCompleted && styles.statusDotCompleted,
                      isPartial && styles.statusDotPartial,
                      isSuggested && !isCompleted && !isPartial && styles.statusDotSuggested,
                    ]}>
                      {isCompleted ? (
                        <MaterialIcons name="check" size={14} color={colors.bgDark} />
                      ) : isPartial ? (
                        <Text style={styles.partialText}>{setsLogged}</Text>
                      ) : (
                        <Text style={styles.indexText}>{i + 1}</Text>
                      )}
                    </View>

                    {/* Exercise info */}
                    <View style={styles.exerciseInfo}>
                      <Text style={[
                        styles.exerciseName,
                        isCompleted && styles.exerciseNameCompleted,
                      ]} numberOfLines={1}>
                        {ex.name}
                      </Text>
                      <Text style={styles.exerciseMeta}>
                        {isCompleted
                          ? `${totalSets} sets done`
                          : isPartial
                            ? `${setsLogged} of ${totalSets} sets`
                            : `${totalSets} sets \u00D7 ${ex.reps || 8} reps`}
                      </Text>
                    </View>

                    {/* Right side */}
                    {isSuggested && !isCompleted && (
                      <Animated.View style={[styles.upNextBadge, pulseStyle]}>
                        <Text style={styles.upNextText}>UP NEXT</Text>
                      </Animated.View>
                    )}
                    {isCompleted && (
                      <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                    )}
                    {!isCompleted && !isSuggested && (
                      <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.2)" />
                    )}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </ScrollView>

          {/* Continue Button */}
          {suggestedNextIdx != null && suggestedNextIdx < exercises.length && (
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => onSelectExercise(suggestedNextIdx)}
              activeOpacity={0.85}
            >
              <Text style={styles.continueText}>
                CONTINUE — {exercises[suggestedNextIdx]?.name}
              </Text>
              <MaterialIcons name="arrow-forward" size={20} color={colors.bgDark} />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 20, 8, 0.97)',
    justifyContent: 'flex-end',
  },
  container: {
    maxHeight: '85%',
    backgroundColor: colors.bgDarker,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(212,255,0,0.15)',
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,255,0,0.08)',
  },
  headerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 16,
    ...fonts.extrabold,
    color: colors.textPrimary,
    letterSpacing: 3,
  },
  headerSub: {
    fontSize: 13,
    ...fonts.medium,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: spacing.md,
  },
  exerciseCardCompleted: {
    backgroundColor: 'rgba(212,255,0,0.04)',
    borderColor: 'rgba(212,255,0,0.1)',
  },
  exerciseCardSuggested: {
    backgroundColor: 'rgba(212,255,0,0.08)',
    borderColor: 'rgba(212,255,0,0.25)',
  },
  statusDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusDotCompleted: {
    backgroundColor: colors.primary,
  },
  statusDotPartial: {
    backgroundColor: 'rgba(251,191,36,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.5)',
  },
  statusDotSuggested: {
    backgroundColor: 'rgba(212,255,0,0.2)',
    borderWidth: 1,
    borderColor: colors.primaryDim,
  },
  partialText: {
    fontSize: 11,
    ...fonts.bold,
    color: 'rgb(251,191,36)',
  },
  indexText: {
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    ...fonts.semibold,
    color: colors.textPrimary,
  },
  exerciseNameCompleted: {
    color: colors.textSecondary,
  },
  exerciseMeta: {
    fontSize: 12,
    ...fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  upNextBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  upNextText: {
    fontSize: 10,
    ...fonts.extrabold,
    color: colors.bgDark,
    letterSpacing: 1.5,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  continueText: {
    fontSize: 15,
    ...fonts.extrabold,
    color: colors.bgDark,
    letterSpacing: 1,
  },
});
