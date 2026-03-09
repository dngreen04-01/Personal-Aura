import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, SectionList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../lib/theme';
import { getPersonalRecords } from '../lib/database';
import { getMuscleGroup, CATEGORIES } from '../lib/muscleGroups';
import PRCard from '../components/progress/PRCard';
import SearchBar from '../components/progress/SearchBar';
import CategoryChips from '../components/progress/CategoryChips';

export default function PRHistoryScreen() {
  const router = useRouter();
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      const prs = await getPersonalRecords();
      setRecords(prs);
    } catch (err) {
      console.error('Failed to load PRs:', err);
    }
  };

  const sections = useMemo(() => {
    const filtered = records.filter(r => {
      const matchesSearch = !search || r.exercise_name.toLowerCase().includes(search.toLowerCase());
      const group = getMuscleGroup(r.exercise_name);
      const matchesCategory = activeCategory === 'All' || group === activeCategory;
      return matchesSearch && matchesCategory;
    });

    // Group by muscle group
    const grouped = {};
    filtered.forEach(r => {
      const group = getMuscleGroup(r.exercise_name);
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(r);
    });

    return Object.entries(grouped).map(([title, data]) => ({
      title,
      count: data.length,
      data,
    }));
  }, [records, search, activeCategory]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>PR History</Text>
      </View>

      <View style={styles.filters}>
        <SearchBar value={search} onChangeText={setSearch} />
        <CategoryChips
          categories={CATEGORIES}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
        />
      </View>

      {sections.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="emoji-events" size={48} color={colors.primaryFaint} />
          <Text style={styles.emptyText}>
            {records.length === 0
              ? 'No personal records yet. Start training!'
              : 'No records match your search.'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => `${item.exercise_name}-${i}`}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
              <Text style={styles.sectionCount}>{section.count} RECORD{section.count !== 1 ? 'S' : ''}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <PRCard
              exerciseName={item.exercise_name}
              prWeight={item.pr_weight}
              prDate={item.pr_date}
              improvementPct={item.improvement_pct}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backBtn: { padding: spacing.xs },
  title: { fontSize: 20, ...fonts.bold, color: colors.textPrimary },
  filters: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm },
  list: { padding: spacing.lg, paddingTop: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: { ...fonts.bold, fontSize: 13, color: colors.textSecondary, letterSpacing: 1 },
  sectionCount: { ...fonts.medium, fontSize: 11, color: colors.textSecondary },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  emptyText: { ...fonts.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
