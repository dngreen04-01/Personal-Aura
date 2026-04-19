import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../lib/theme';
import {
  getProgressSummary,
  getTrainingContext,
  getCompletedSessionCount,
} from '../../lib/database';
import { getAuraInsight } from '../../lib/api';
import LineChart from '../../components/progress/LineChart';
import ConsistencyHeatmap from '../../components/progress/ConsistencyHeatmap';
import AuraInsightCard from '../../components/progress/AuraInsightCard';
import PRCardFull from '../../components/progress/PRCardFull';
import MuscleRecencyRow from '../../components/progress/MuscleRecencyRow';

const TABS = ['Overview', 'PRs', 'Muscles'];

export default function ProgressScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Overview');
  const [data, setData] = useState(null);
  const [training, setTraining] = useState(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [insight, setInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const loadData = async () => {
    try {
      setLoading(true);
      const [summary, ctx, sessions] = await Promise.all([
        getProgressSummary(),
        getTrainingContext(28),
        getCompletedSessionCount(),
      ]);
      setData(summary);
      setTraining(ctx);
      setSessionCount(sessions || 0);

      setInsightLoading(true);
      try {
        const { insight: text } = await getAuraInsight({
          totalWorkouts: summary.weeklyVolume?.length || 0,
          streak: summary.streak,
          prs: summary.personalRecords?.length || 0,
          recentVolume: summary.weeklyVolume,
        });
        setInsight(text);
      } catch { setInsight(''); }
      finally { setInsightLoading(false); }
    } catch (err) {
      console.error('Failed to load progress:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasData = data && (
    (data.weeklyVolume && data.weeklyVolume.length > 0) ||
    (data.personalRecords && data.personalRecords.length > 0)
  );

  if (!hasData && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <View style={{ width: 38 }} />
          <Text style={styles.title}>Progress</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.empty}>
          <MaterialIcons name="show-chart" size={64} color={colors.primaryFaint} />
          <Text style={styles.emptyTitle}>No Data Yet</Text>
          <Text style={styles.emptyText}>
            Complete your first workout to start tracking your progress, streaks, and personal records.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={{ width: 38 }} />
        <Text style={styles.title}>Progress</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push('/share')}
          activeOpacity={0.8}
        >
          <MaterialIcons name="ios-share" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map(t => {
          const active = activeTab === t;
          return (
            <TouchableOpacity
              key={t}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {activeTab === 'Overview' && (
          <OverviewTab
            data={data}
            sessionCount={sessionCount}
            insight={insight}
            insightLoading={insightLoading}
          />
        )}
        {activeTab === 'PRs' && <PRsTab prs={data?.personalRecords || []} />}
        {activeTab === 'Muscles' && <MusclesTab training={training} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function OverviewTab({ data, sessionCount, insight, insightLoading }) {
  const weeklyVolume = data?.weeklyVolume || [];
  const strengthGains = data?.strengthGains || [];
  const volumeData = weeklyVolume.map(d => d.volume);
  const strengthData = strengthGains.map(d => d.maxWeight);
  const strengthLabels = strengthGains.map(d => {
    const parts = (d.week || '').split('-W');
    return parts[1] ? `W${parts[1]}` : d.week;
  });

  const latestVol = volumeData[volumeData.length - 1] || 0;
  const prevVol = volumeData[volumeData.length - 2] || 0;
  const volDelta = prevVol > 0 ? (((latestVol - prevVol) / prevVol) * 100).toFixed(1) : '0';
  const totalVolK = (volumeData.reduce((a, b) => a + b, 0) / 1000).toFixed(1);

  const streak = data?.streak?.current || 0;

  return (
    <>
      {/* Hero stat grid */}
      <View style={styles.heroGrid}>
        <HeroStat label="Streak" value={streak} unit="days" icon="local-fire-department" accent />
        <HeroStat
          label="Sessions"
          value={sessionCount}
          unit="logged"
          icon="fitness-center"
        />
        <HeroStat
          label="Volume"
          value={`${totalVolK}k`}
          unit="kg · total"
          icon="trending-up"
          accent
        />
        <HeroStat
          label="W/W change"
          value={`${volDelta > 0 ? '+' : ''}${volDelta}%`}
          unit="volume"
          icon="show-chart"
        />
      </View>

      {/* Aura insight */}
      <AuraInsightCard insight={insight} loading={insightLoading} />

      {/* Strength chart */}
      {strengthData.length > 1 && (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>Strength trend</Text>
              <Text style={styles.chartSub}>Heaviest top set · last {strengthData.length} weeks</Text>
            </View>
          </View>
          <LineChart data={strengthData} xLabels={strengthLabels} />
        </View>
      )}

      {/* Consistency heatmap */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartTitle}>Consistency</Text>
            <Text style={styles.chartSub}>Last 12 weeks</Text>
          </View>
        </View>
        <ConsistencyHeatmap data={data?.heatmap || []} streak={streak} />
      </View>
    </>
  );
}

function PRsTab({ prs }) {
  if (!prs || prs.length === 0) {
    return <Text style={styles.emptyInline}>No personal records yet. Log a workout to start stacking PRs.</Text>;
  }
  const sorted = [...prs].sort((a, b) => new Date(b.pr_date || 0) - new Date(a.pr_date || 0));
  return (
    <View style={{ gap: 10 }}>
      {sorted.map((pr, i) => (
        <PRCardFull
          key={`${pr.exercise_name}-${i}`}
          exercise={pr.exercise_name}
          weight={pr.pr_weight}
          unit="kg"
          reps={pr.pr_reps}
          date={pr.pr_date ? new Date(pr.pr_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null}
          improvement={pr.improvement_pct}
          isNew={i === 0}
        />
      ))}
    </View>
  );
}

function MusclesTab({ training }) {
  if (!training || !training.muscleGroupLastTrained) {
    return <Text style={styles.emptyInline}>No muscle-group data yet. Log a workout and tag muscle groups via your plan.</Text>;
  }
  const groups = Object.entries(training.muscleGroupLastTrained);
  if (groups.length === 0) {
    return <Text style={styles.emptyInline}>Still building muscle-group history. Log a few more sessions.</Text>;
  }
  const now = new Date();
  const sessionCountByMuscle = {};
  (training.recentSessions || []).forEach(s => {
    (s.muscleGroups || []).forEach(m => {
      sessionCountByMuscle[m] = (sessionCountByMuscle[m] || 0) + 1;
    });
  });
  const rows = groups
    .map(([group, lastDate]) => {
      const d = new Date(lastDate);
      const daysAgo = Math.max(0, Math.floor((now - d) / 86400000));
      return { group, daysAgo, sessions4w: sessionCountByMuscle[group] || 0 };
    })
    .sort((a, b) => a.daysAgo - b.daysAgo);

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionHint}>Days since last trained · sessions in last 4 weeks</Text>
      {rows.map(r => (
        <MuscleRecencyRow key={r.group} {...r} />
      ))}
    </View>
  );
}

function HeroStat({ label, value, unit, icon, accent }) {
  return (
    <View style={[styles.heroStat, accent && styles.heroStatAccent]}>
      <View style={styles.heroStatHeader}>
        <MaterialIcons
          name={icon}
          size={13}
          color={accent ? colors.primary : colors.textSecondary}
        />
        <Text style={styles.heroStatLabel}>{label.toUpperCase()}</Text>
      </View>
      <Text style={[styles.heroStatValue, accent && styles.heroStatValueAccent]}>{value}</Text>
      <Text style={styles.heroStatUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: { width: 38, alignItems: 'center', padding: 8 },
  title: { fontSize: 16, ...fonts.bold, color: colors.textPrimary, letterSpacing: -0.3 },

  // Tabs
  tabRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    gap: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primaryFaint,
    borderColor: colors.borderSubtle,
  },
  tabText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  tabTextActive: { color: colors.primary },

  scroll: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },

  // Hero stats
  heroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroStat: {
    width: '48.5%',
    padding: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
  },
  heroStatAccent: {
    backgroundColor: colors.primaryGhost,
    borderColor: colors.borderSubtle,
  },
  heroStatHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  heroStatLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    color: colors.textSecondary,
  },
  heroStatValue: {
    fontSize: 24,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: -0.8,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    lineHeight: 28,
  },
  heroStatValueAccent: { color: colors.primary },
  heroStatUnit: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Chart card
  chartCard: {
    padding: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    gap: 12,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  chartTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.textPrimary, letterSpacing: -0.3 },
  chartSub: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.textSecondary, marginTop: 1 },

  // Empty states
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: 18, ...fonts.bold, color: colors.textPrimary },
  emptyText: { fontSize: 14, ...fonts.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  emptyInline: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', padding: spacing.lg, fontFamily: 'Inter_500Medium' },
  sectionHint: { fontSize: 12, color: colors.textSecondary, paddingHorizontal: 4, marginBottom: 4 },
});
