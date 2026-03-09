import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../lib/theme';
import { getProgressSummary } from '../../lib/database';
import { getAuraInsight } from '../../lib/api';
import LineChart from '../../components/progress/LineChart';
import ConsistencyHeatmap from '../../components/progress/ConsistencyHeatmap';
import MetricToggleBar from '../../components/progress/MetricToggleBar';
import AuraInsightCard from '../../components/progress/AuraInsightCard';
import AchievementBadge from '../../components/progress/AchievementBadge';

export default function ProgressScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Strength');
  const [data, setData] = useState(null);
  const [insight, setInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const summary = await getProgressSummary();
      setData(summary);

      // Fetch AI insight
      setInsightLoading(true);
      try {
        const { insight: text } = await getAuraInsight({
          totalWorkouts: summary.weeklyVolume?.length || 0,
          streak: summary.streak,
          prs: summary.personalRecords?.length || 0,
          recentVolume: summary.weeklyVolume,
        });
        setInsight(text);
      } catch {
        setInsight('');
      } finally {
        setInsightLoading(false);
      }
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
        <View style={styles.header}>
          <Text style={styles.title}>Progress</Text>
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

  // Prepare chart data
  const strengthData = data?.strengthGains?.map(d => d.maxWeight) || [];
  const strengthLabels = data?.strengthGains?.map(d => {
    const parts = d.week.split('-W');
    return `W${parts[1]}`;
  }) || [];

  const volumeData = data?.weeklyVolume?.map(d => d.volume) || [];
  const volumeLabels = data?.weeklyVolume?.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
  }) || [];

  const totalVolume = volumeData.reduce((sum, v) => sum + v, 0);
  const volumeChange = volumeData.length >= 2
    ? (((volumeData[volumeData.length - 1] - volumeData[0]) / (volumeData[0] || 1)) * 100).toFixed(1)
    : 0;

  const strengthChange = strengthData.length >= 2
    ? (((strengthData[strengthData.length - 1] - strengthData[0]) / (strengthData[0] || 1)) * 100).toFixed(1)
    : 0;

  // Achievements from PRs
  const topPRs = (data?.personalRecords || []).slice(0, 5);
  const achievements = topPRs.map(pr => ({
    title: pr.exercise_name,
    subtitle: `${pr.pr_weight} kg`,
    icon: 'emoji-events',
    locked: false,
  }));
  // Pad with locked placeholders
  while (achievements.length < 5) {
    achievements.push({ title: 'Locked', subtitle: 'Keep training', icon: 'lock', locked: true });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>Progress</Text>
        </View>

        <AuraInsightCard insight={insight} loading={insightLoading} />

        <MetricToggleBar activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === 'Strength' && (
          <View style={styles.chartSection}>
            {strengthData.length > 1 ? (
              <>
                <LineChart data={strengthData} xLabels={strengthLabels} />
                <View style={styles.statRow}>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                      {strengthChange > 0 ? '+' : ''}{strengthChange}%
                    </Text>
                    <Text style={styles.statLabel}>Strength Change</Text>
                  </View>
                  <View style={styles.statBadge}>
                    <Text style={styles.statBadgeText}>L{data?.strengthGains?.length || 0}W</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.noDataText}>Log more workouts to see strength trends</Text>
            )}
          </View>
        )}

        {activeTab === 'Volume' && (
          <View style={styles.chartSection}>
            {volumeData.length > 1 ? (
              <>
                <LineChart data={volumeData} xLabels={volumeLabels} color={colors.primary} />
                <View style={styles.statRow}>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                      {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}K` : totalVolume} kg
                    </Text>
                    <Text style={styles.statLabel}>Total Volume</Text>
                  </View>
                  <View style={styles.statBadge}>
                    <Text style={styles.statBadgeText}>
                      {volumeChange > 0 ? '+' : ''}{volumeChange}%
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.noDataText}>Log more workouts to see volume trends</Text>
            )}
          </View>
        )}

        {activeTab === 'Streak' && (
          <View style={styles.chartSection}>
            <ConsistencyHeatmap
              data={data?.heatmap || []}
              streak={data?.streak?.current || 0}
            />
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{data?.streak?.current || 0}</Text>
                <Text style={styles.statLabel}>Current Streak</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{data?.streak?.longest || 0}</Text>
                <Text style={styles.statLabel}>Longest Streak</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Achievements</Text>
          <TouchableOpacity onPress={() => router.push('/pr-history')}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badgeScroll}
        >
          {achievements.map((a, i) => (
            <AchievementBadge key={i} {...a} />
          ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingBottom: spacing.xs },
  title: { fontSize: 20, ...fonts.bold, color: colors.textPrimary },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: 18, ...fonts.bold, color: colors.textPrimary },
  emptyText: { fontSize: 14, ...fonts.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  chartSection: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statCard: { flex: 1 },
  statValue: { ...fonts.bold, fontSize: 22, color: colors.primary },
  statLabel: { ...fonts.regular, fontSize: 12, color: colors.textSecondary },
  statBadge: {
    backgroundColor: colors.primaryFaint,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statBadgeText: { ...fonts.semibold, fontSize: 11, color: colors.primary },
  noDataText: { ...fonts.regular, fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...fonts.bold, fontSize: 16, color: colors.textPrimary },
  seeAll: { ...fonts.semibold, fontSize: 13, color: colors.primary },
  badgeScroll: { gap: spacing.sm },
});
