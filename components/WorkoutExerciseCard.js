import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';

export default function WorkoutExerciseCard({
  exercise,
  currentSet,
  totalSets,
  weight,
  onWeightChange,
  reps,
  onRepsChange,
  weightUnit = 'kg',
  weightIncrement = 2.5,
  lastLoggedWeight,
  lastLoggedReps,
  targetReps,
  onLog,
  category = 'Compound',
  cue,
}) {
  const hasWeight = weight != null;
  const isPR = lastLoggedWeight != null && hasWeight && weight > lastLoggedWeight;
  const delta = isPR ? (weight - lastLoggedWeight).toFixed(1) : null;

  return (
    <View style={styles.card}>
      {/* Badges */}
      <View style={styles.badgeRow}>
        <View style={styles.badgePrimary}>
          <Text style={styles.badgePrimaryText}>{category.toUpperCase()}</Text>
        </View>
        {lastLoggedWeight != null && (
          <View style={styles.badgeSecondary}>
            <Text style={styles.badgeSecondaryText}>
              LAST: {lastLoggedWeight}
              {weightUnit.toUpperCase()}
              {lastLoggedReps != null ? ` × ${lastLoggedReps}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Title + subtitle */}
      <Text style={styles.title} numberOfLines={2}>{exercise?.name || 'Exercise'}</Text>
      <Text style={styles.subtitle}>
        Set {currentSet} of {totalSets}
        {targetReps ? ` · Target ${targetReps} reps` : ''}
      </Text>

      {/* Set dots */}
      <View style={styles.dotsRow}>
        {Array.from({ length: totalSets }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < currentSet - 1 && styles.dotDone,
              i === currentSet - 1 && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Hero weight stepper */}
      {hasWeight && (
        <>
          <Text style={styles.sectionLabel}>TARGET WEIGHT</Text>
          <View style={styles.weightRow}>
            <TouchableOpacity
              style={styles.chevronBtn}
              onPress={() => onWeightChange?.(Math.max(0, +(weight - weightIncrement).toFixed(2)))}
              activeOpacity={0.7}
            >
              <MaterialIcons name="chevron-left" size={26} color={colors.primary} />
            </TouchableOpacity>
            <View style={styles.weightCenter}>
              <Text style={styles.weightValue}>{formatWeight(weight)}</Text>
              <Text style={styles.weightUnit}>{weightUnit.toUpperCase()}</Text>
            </View>
            <TouchableOpacity
              style={styles.chevronBtn}
              onPress={() => onWeightChange?.(+(weight + weightIncrement).toFixed(2))}
              activeOpacity={0.7}
            >
              <MaterialIcons name="chevron-right" size={26} color={colors.primary} />
            </TouchableOpacity>
          </View>
          {isPR && (
            <Text style={styles.prCallout}>
              +{delta}{weightUnit} from last PR · <Text style={styles.prBold}>new record</Text>
            </Text>
          )}
        </>
      )}

      {/* Reps tile */}
      <View style={styles.repsTile}>
        <View style={{ flex: 1 }}>
          <Text style={styles.repsLabel}>REPS DONE</Text>
          <Text style={styles.repsValue}>{reps}</Text>
        </View>
        <TouchableOpacity
          style={styles.repBtn}
          onPress={() => onRepsChange?.(Math.max(1, reps - 1))}
          activeOpacity={0.7}
        >
          <Text style={styles.repBtnText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.repBtn}
          onPress={() => onRepsChange?.(reps + 1)}
          activeOpacity={0.7}
        >
          <Text style={styles.repBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Log button */}
      <TouchableOpacity style={styles.logBtn} onPress={onLog} activeOpacity={0.9}>
        <MaterialIcons name="check" size={18} color={colors.bgDark} />
        <Text style={styles.logBtnText}>Log set {currentSet}</Text>
      </TouchableOpacity>

      {cue ? (
        <Text style={styles.cue}>{cue}</Text>
      ) : null}
    </View>
  );
}

function formatWeight(w) {
  if (w == null) return '0';
  const rounded = Math.round(w * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 20,
    padding: spacing.md + 4,
  },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  badgePrimary: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.primaryFaint,
  },
  badgePrimaryText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    color: colors.primary,
  },
  badgeSecondary: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.bgCardSolid,
  },
  badgeSecondaryText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: -0.7,
    color: colors.textPrimary,
    lineHeight: 30,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: colors.textSecondary,
    marginBottom: 16,
  },
  dotsRow: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  dot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderLight,
  },
  dotDone: { backgroundColor: colors.primary },
  dotActive: { backgroundColor: colors.primaryDim },

  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
    color: colors.textMuted,
    marginBottom: 4,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevronBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgCardSolid,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightCenter: { flex: 1, alignItems: 'center' },
  weightValue: {
    fontSize: 72,
    fontFamily: 'Inter_800ExtraBold',
    color: colors.primary,
    letterSpacing: -3,
    lineHeight: 72,
    fontVariant: ['tabular-nums'],
  },
  weightUnit: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: colors.textSecondary,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  prCallout: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  prBold: { fontFamily: 'Inter_700Bold' },

  repsTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    padding: 12,
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.md,
  },
  repsLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  repsValue: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  repBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.bgDark,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repBtnText: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    lineHeight: 24,
  },

  logBtn: {
    marginTop: 18,
    paddingVertical: 16,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: colors.bgDark,
    letterSpacing: -0.2,
  },
  cue: {
    marginTop: 14,
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
