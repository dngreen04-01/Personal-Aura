import React, { useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../lib/theme';

const DIFFICULTY_COLORS = {
  beginner: '#22c55e',
  intermediate: colors.primary,
  advanced: '#ef4444',
};

export default function ExerciseDetail({ exercise, visible, onClose, onSwap, showSwapButton }) {
  const [imageLoading, setImageLoading] = useState(true);

  if (!exercise) return null;

  const diffColor = DIFFICULTY_COLORS[exercise.difficulty] || colors.textSecondary;
  const mediaUri = exercise.gifUrl || exercise.imageUrl;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>{exercise.name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Exercise Media */}
            {mediaUri && (
              <View style={styles.mediaSection}>
                <Image
                  source={{ uri: mediaUri }}
                  style={styles.exerciseImage}
                  resizeMode="contain"
                  onLoadStart={() => setImageLoading(true)}
                  onLoadEnd={() => setImageLoading(false)}
                />
                {imageLoading && (
                  <ActivityIndicator
                    style={styles.imageLoader}
                    size="large"
                    color={colors.primary}
                  />
                )}
              </View>
            )}

            {/* Badges */}
            <View style={styles.badgeRow}>
              <Badge label={exercise.category} color={colors.primary} />
              <Badge label={exercise.difficulty} color={diffColor} />
              {(exercise.equipment || []).map(eq => (
                <Badge key={eq} label={eq} color={colors.textSecondary} />
              ))}
            </View>

            {/* Muscles */}
            <Section title="Primary Muscles">
              <Text style={styles.bodyText}>
                {(exercise.primaryMuscles || []).join(', ') || 'N/A'}
              </Text>
            </Section>

            {exercise.secondaryMuscles?.length > 0 && (
              <Section title="Secondary Muscles">
                <Text style={styles.bodyText}>
                  {exercise.secondaryMuscles.join(', ')}
                </Text>
              </Section>
            )}

            {/* Instructions */}
            {exercise.instructions?.length > 0 && (
              <Section title="Instructions">
                {exercise.instructions.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text style={styles.stepNumber}>{i + 1}.</Text>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </Section>
            )}

            {/* Tips */}
            {exercise.tips?.length > 0 && (
              <Section title="Tips">
                {exercise.tips.map((tip, i) => (
                  <View key={i} style={styles.tipRow}>
                    <MaterialIcons name="lightbulb-outline" size={14} color={colors.primary} />
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </Section>
            )}

            {/* Alternatives */}
            {exercise.alternatives?.length > 0 && (
              <Section title="Alternatives">
                {exercise.alternatives.map((alt) => (
                  <Text key={alt} style={styles.altText}>{alt}</Text>
                ))}
              </Section>
            )}

            <View style={{ height: spacing.xl }} />
          </ScrollView>

          {/* Swap Button */}
          {showSwapButton && onSwap && (
            <TouchableOpacity style={styles.swapButton} onPress={() => onSwap(exercise)}>
              <MaterialIcons name="swap-horiz" size={20} color={colors.bgDark} />
              <Text style={styles.swapButtonText}>Swap Into Workout</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Badge({ label, color }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    ...fonts.bold,
    fontSize: 20,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.md,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
  },
  mediaSection: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgCardSolid,
  },
  exerciseImage: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  imageLoader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  badgeText: {
    ...fonts.semibold,
    fontSize: 11,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...fonts.bold,
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  bodyText: {
    ...fonts.regular,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  stepNumber: {
    ...fonts.bold,
    fontSize: 14,
    color: colors.primary,
    width: 20,
  },
  stepText: {
    ...fonts.regular,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 20,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  tipText: {
    ...fonts.regular,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 20,
  },
  altText: {
    ...fonts.medium,
    fontSize: 14,
    color: colors.primaryDim,
    marginBottom: spacing.xs,
  },
  swapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  swapButtonText: {
    ...fonts.bold,
    fontSize: 15,
    color: colors.bgDark,
  },
});
