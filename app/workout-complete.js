import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, spacing, radius } from '../lib/theme';
import { getSessionStats, getSessionSets, getUserProfile } from '../lib/database';

export default function WorkoutCompleteScreen() {
  const router = useRouter();
  const { sessionId, focus } = useLocalSearchParams();
  const [stats, setStats] = useState(null);
  const [setsByExercise, setSetsByExercise] = useState({});
  const [firstName, setFirstName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [statData, setData, profile] = await Promise.all([
          sessionId ? getSessionStats(sessionId) : Promise.resolve(null),
          sessionId ? getSessionSets(sessionId) : Promise.resolve([]),
          getUserProfile(),
        ]);
        setStats(statData);
        const grouped = {};
        (setData || []).forEach(row => {
          const key = row.exercise_name;
          (grouped[key] = grouped[key] || []).push(row);
        });
        setSetsByExercise(grouped);
        if (profile?.name) setFirstName(profile.name.split(' ')[0]);
      } catch (e) {
        console.error('workout-complete load failed', e);
      }
    })();
  }, [sessionId]);

  const mins = stats?.duration_seconds ? Math.floor(stats.duration_seconds / 60) : 0;
  const totalVolume = stats?.total_volume || 0;
  const totalReps = stats?.total_reps || 0;

  const handleShare = () => {
    router.push({
      pathname: '/share',
      params: {
        sessionId,
        focus: focus || '',
      },
    });
  };

  const handleDone = () => {
    router.replace('/(tabs)');
  };

  const exercises = Object.keys(setsByExercise);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleDone} style={styles.iconBtn}>
          <MaterialIcons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerLabel}>SESSION COMPLETE</Text>
        <TouchableOpacity onPress={handleShare} style={styles.iconBtn}>
          <MaterialIcons name="ios-share" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroWrap}>
          <Text style={styles.heroEmoji}>💪</Text>
          <Text style={styles.heroTitle}>
            Nice work{firstName ? `, ${firstName}` : ''}
          </Text>
          <Text style={styles.heroSub}>
            {focus ? `${focus} — ` : ''}Clean session. Consistency {'>'} intensity.
          </Text>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <SummaryStat
            label="Volume"
            value={totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : Math.round(totalVolume)}
            unit="kg moved"
            accent
          />
          <SummaryStat label="Time" value={mins} unit="minutes" />
          <SummaryStat label="Reps" value={totalReps} unit="total" />
        </View>

        {/* Per-exercise breakdown */}
        {exercises.length > 0 && (
          <View style={styles.breakdownWrap}>
            <Text style={styles.sectionLabel}>EXERCISE BREAKDOWN</Text>
            <View style={{ gap: 6 }}>
              {exercises.map(name => {
                const sets = setsByExercise[name];
                const hasWeight = sets[0]?.weight != null;
                return (
                  <View key={name} style={styles.exerciseCard}>
                    <View style={styles.exerciseHeader}>
                      <Text style={styles.exerciseName}>{name}</Text>
                      <Text style={styles.exerciseMeta}>{sets.length} sets</Text>
                    </View>
                    <View style={styles.setPillRow}>
                      {sets.map((s, i) => (
                        <View key={i} style={styles.setPill}>
                          <Text style={styles.setPillText}>
                            {hasWeight ? `${s.weight}×${s.reps}` : `${s.reps}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleShare} activeOpacity={0.9}>
            <MaterialIcons name="ios-share" size={16} color={colors.bgDark} />
            <Text style={styles.primaryBtnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleDone} activeOpacity={0.8}>
            <Text style={styles.secondaryBtnText}>Back to chat</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryStat({ label, value, unit, accent }) {
  return (
    <View style={[styles.statTile, accent && styles.statTileAccent]}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarker },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: { padding: 8, width: 38, alignItems: 'center' },
  headerLabel: {
    fontSize: 11,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: 2,
    color: colors.textMuted,
  },
  scroll: { paddingBottom: spacing.xl },
  heroWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, alignItems: 'center' },
  heroEmoji: { fontSize: 56, marginBottom: spacing.sm },
  heroTitle: {
    fontSize: 28,
    fontFamily: 'Inter_800ExtraBold',
    color: colors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: 6,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  statTile: {
    flex: 1,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  statTileAccent: {
    backgroundColor: colors.primaryFaint,
    borderColor: colors.borderSubtle,
  },
  statValue: {
    fontSize: 24,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: -0.6,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    lineHeight: 26,
  },
  statValueAccent: { color: colors.primary },
  statUnit: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textSecondary,
    marginTop: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: spacing.md,
  },
  breakdownWrap: { paddingBottom: spacing.md },
  exerciseCard: {
    marginHorizontal: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  exerciseName: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
    letterSpacing: -0.2,
    flex: 1,
  },
  exerciseMeta: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textSecondary,
  },
  setPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  setPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.bgCardSolid,
  },
  setPillText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: colors.bgDark,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
  },
});
