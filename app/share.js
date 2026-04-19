import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors, spacing, radius } from '../lib/theme';
import { getSessionStats, getSessionSets, getUserProfile, getWorkoutStreak } from '../lib/database';
import AuraOrb from '../components/AuraOrb';
import ShareMetric from '../components/ShareMetric';

export default function ShareScreen() {
  const router = useRouter();
  const { sessionId, focus } = useLocalSearchParams();
  const [stats, setStats] = useState(null);
  const [heaviest, setHeaviest] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [statData, setData, profile, streakVal] = await Promise.all([
          sessionId ? getSessionStats(sessionId) : Promise.resolve(null),
          sessionId ? getSessionSets(sessionId) : Promise.resolve([]),
          getUserProfile(),
          getWorkoutStreak(),
        ]);
        setStats(statData);
        if (setData && setData.length) {
          const withWeight = setData.filter(s => s.weight != null);
          if (withWeight.length) {
            const top = withWeight.reduce((a, b) => (b.weight > a.weight ? b : a));
            setHeaviest(top);
          }
        }
        if (profile?.name) setFirstName(profile.name.split(' ')[0]);
        setStreak(streakVal || 0);
      } catch (e) {
        console.error('share load failed', e);
      }
    })();
  }, [sessionId]);

  const mins = stats?.duration_seconds ? Math.floor(stats.duration_seconds / 60) : 0;
  const secs = stats?.duration_seconds ? stats.duration_seconds % 60 : 0;
  const totalVolume = stats?.total_volume || 0;
  const totalReps = stats?.total_reps || 0;
  const exercisesDone = stats?.exercises_done || 0;

  const caption = heaviest
    ? `Clean session. Top set: ${heaviest.weight}${heaviest.weight_unit} × ${heaviest.reps}. 🙌`
    : 'Another one in the books. Consistency compounds.';

  const handleShare = async () => {
    try {
      await Share.share({ message: `${caption}\n\nCoached by Aura.` });
    } catch (e) {}
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialIcons name="chevron-left" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Share</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Preview card */}
        <View style={styles.card}>
          <View style={styles.glow} />

          {/* Card header */}
          <View style={styles.cardHeader}>
            <View style={styles.initialsOrb}>
              <Text style={styles.initialsText}>{(firstName?.[0] || 'A').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{firstName || 'Athlete'}</Text>
              <Text style={styles.cardMeta}>
                {new Date().toLocaleDateString(undefined, { weekday: 'long' })} · Aura coached
              </Text>
            </View>
            <AuraOrb size={20} />
          </View>

          {/* Title */}
          <Text style={styles.kicker}>Today's Session</Text>
          <Text style={styles.title}>{focus || 'Strength Session'}</Text>

          {/* Hero metric */}
          <View style={styles.heroMetric}>
            <Text style={styles.heroLabel}>
              {heaviest ? 'TOP SET' : 'VOLUME'}
            </Text>
            {heaviest ? (
              <View style={styles.heroRow}>
                <Text style={styles.heroValue}>{heaviest.weight}</Text>
                <Text style={styles.heroUnit}>{heaviest.weight_unit}</Text>
                <Text style={styles.heroBy}>× {heaviest.reps}</Text>
                <Text style={styles.heroExercise} numberOfLines={1}>{heaviest.exercise_name}</Text>
              </View>
            ) : (
              <View style={styles.heroRow}>
                <Text style={styles.heroValue}>
                  {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : Math.round(totalVolume)}
                </Text>
                <Text style={styles.heroUnit}>kg</Text>
              </View>
            )}
          </View>

          {/* Stats grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statCell}>
              <ShareMetric
                label="Volume"
                value={totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : Math.round(totalVolume)}
                unit="kg"
              />
            </View>
            <View style={styles.statCell}>
              <ShareMetric
                label="Time"
                value={`${mins}:${String(secs).padStart(2, '0')}`}
                unit=""
                align="right"
              />
            </View>
            <View style={styles.statCell}>
              <ShareMetric label="Total reps" value={totalReps} unit="" />
            </View>
            <View style={styles.statCell}>
              <ShareMetric label="Exercises" value={exercisesDone} unit="" align="right" />
            </View>
          </View>

          {/* Footer */}
          <View style={styles.cardFooter}>
            <View style={styles.footerDot} />
            <Text style={styles.footerText}>
              Coached by <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold' }}>Aura</Text>
            </Text>
            {streak > 0 && (
              <Text style={styles.footerStreak}>Day {streak} streak 🔥</Text>
            )}
          </View>
        </View>

        {/* Caption */}
        <Text style={styles.sectionLabel}>CAPTION</Text>
        <View style={styles.captionBox}>
          <Text style={styles.captionText}>{caption}</Text>
        </View>

        {/* Destinations */}
        <View style={styles.destinationRow}>
          {['Instagram', 'Twitter', 'Strava'].map(d => (
            <TouchableOpacity key={d} style={styles.destBtn} activeOpacity={0.7}>
              <Text style={styles.destBtnText}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={styles.ctaWrap}>
        <TouchableOpacity style={styles.ctaBtn} onPress={handleShare} activeOpacity={0.9}>
          <MaterialIcons name="ios-share" size={16} color={colors.bgDark} />
          <Text style={styles.ctaText}>Share workout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
  iconBtn: { width: 38, alignItems: 'center', padding: 8 },
  headerTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
  },
  scroll: { padding: spacing.md, paddingBottom: 120 },

  // Card
  card: {
    backgroundColor: '#0a0b04',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.primaryFaint,
    opacity: 0.8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  initialsOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 13,
    fontFamily: 'Inter_800ExtraBold',
    color: colors.bgDark,
  },
  cardName: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.textPrimary, letterSpacing: -0.2 },
  cardMeta: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary },
  kicker: {
    fontSize: 11,
    letterSpacing: 2,
    color: colors.primary,
    fontFamily: 'Inter_800ExtraBold',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: -0.6,
    lineHeight: 30,
    color: colors.textPrimary,
    marginBottom: 14,
  },
  heroMetric: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 14,
  },
  heroLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textMuted,
    fontFamily: 'Inter_800ExtraBold',
    textTransform: 'uppercase',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  heroValue: {
    fontSize: 52,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: -2,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    lineHeight: 52,
  },
  heroUnit: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.textSecondary },
  heroBy: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary, marginLeft: 4 },
  heroExercise: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: colors.textSecondary,
    marginLeft: 'auto',
    maxWidth: 140,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCell: {
    width: '50%',
    paddingBottom: 10,
  },
  cardFooter: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
  },
  footerText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  footerStreak: {
    marginLeft: 'auto',
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textMuted,
  },

  // Caption
  sectionLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  captionBox: {
    padding: 12,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
  },
  captionText: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
  },

  // Destinations
  destinationRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  destBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    alignItems: 'center',
  },
  destBtnText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textPrimary,
  },

  // CTA
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bgDarker,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  ctaBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: colors.bgDark,
  },
});
