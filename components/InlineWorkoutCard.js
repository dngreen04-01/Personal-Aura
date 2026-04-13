import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../lib/theme';
import { calculateWorkoutDuration } from '../lib/calculateWorkoutDuration';

export default function InlineWorkoutCard({ workout, onStart }) {
  if (!workout) return null;

  const { focus, blocks, exercises = [], estimatedDuration } = workout;

  if (exercises.length === 0) return null;

  const duration = estimatedDuration || calculateWorkoutDuration({ blocks, exercises });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>WORKOUT</Text>
      <Text style={styles.focus}>{focus}</Text>

      <View style={styles.meta}>
        <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.metaText}>{duration} min</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>{exercises.length} exercises</Text>
      </View>

      <View style={styles.exerciseList}>
        {exercises.map((ex, i) => (
          <View key={i} style={styles.exerciseRow}>
            <Text style={styles.exerciseIndex}>{i + 1}.</Text>
            <Text style={styles.exerciseName} numberOfLines={1}>{ex.name}</Text>
            <Text style={styles.exerciseSets}>
              {ex.sets}×{ex.reps}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.startButton} onPress={() => onStart(workout)} activeOpacity={0.8}>
        <Text style={styles.startButtonText}>Start Workout</Text>
        <Ionicons name="play" size={16} color={colors.bgDark} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,255,0,0.2)',
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  label: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: colors.textMuted,
    letterSpacing: 2,
  },
  focus: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textSecondary,
  },
  metaDot: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textSecondary,
    marginHorizontal: 2,
  },
  exerciseList: {
    marginTop: spacing.xs,
    gap: 6,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exerciseIndex: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: colors.textSecondary,
    width: 24,
  },
  exerciseName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: colors.textPrimary,
  },
  exerciseSets: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.xs,
  },
  startButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: colors.bgDark,
  },
});
