import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../lib/theme';

const CATEGORY_ICONS = {
  push: 'fitness-center',
  chest: 'fitness-center',
  tricep: 'fitness-center',
  pull: 'fitness-center',
  back: 'fitness-center',
  bicep: 'fitness-center',
  leg: 'directions-run',
  glute: 'directions-run',
  squat: 'directions-run',
  hiit: 'local-fire-department',
  full: 'local-fire-department',
  power: 'local-fire-department',
  rest: 'self-improvement',
  recovery: 'self-improvement',
  mobility: 'self-improvement',
  stretch: 'self-improvement',
};

function getCategoryLabel(focus) {
  const lower = focus.toLowerCase();
  if (lower.includes('rest') || lower.includes('recovery') || lower.includes('mobility')) return 'Mobility';
  if (lower.includes('hiit') || lower.includes('full body') || lower.includes('power')) return 'HIIT';
  return 'Strength';
}

function getCategoryIcon(focus) {
  const lower = focus.toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return 'fitness-center';
}

export default function ChangeFocusScreen() {
  const router = useRouter();
  const { planJson } = useLocalSearchParams();
  const plan = planJson ? JSON.parse(planJson) : [];

  const handleSelect = (day) => {
    router.replace({
      pathname: '/workout-summary',
      params: { dayJson: JSON.stringify(day) },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Focus</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Select a different workout or ask Aura for a custom session.</Text>

        {plan.map((day, i) => {
          const category = getCategoryLabel(day.focus);
          const icon = getCategoryIcon(day.focus);
          const exerciseCount = day.exercises?.length || 0;
          const estMinutes = day.focus.toLowerCase().includes('rest')
            ? 20
            : Math.max(30, exerciseCount * 8);

          return (
            <View key={i} style={styles.card}>
              {/* Icon hero area */}
              <View style={styles.cardHero}>
                <MaterialIcons name={icon} size={48} color="rgba(212,255,0,0.15)" />
              </View>

              <View style={styles.cardContent}>
                <Text style={styles.categoryLabel}>{category}</Text>
                <Text style={styles.cardTitle}>{day.focus}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardMeta}>{estMinutes} mins  {exerciseCount} exercises</Text>
                  <TouchableOpacity style={styles.selectButton} onPress={() => handleSelect(day)}>
                    <Text style={styles.selectButtonText}>Select</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}

        {/* Custom Workout CTA */}
        <View style={styles.customCard}>
          <View style={styles.customHeader}>
            <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
            <Text style={styles.customTitle}>Custom Workout</Text>
          </View>
          <Text style={styles.customDescription}>
            Ask Aura to create something specific for you today. Tell her how you feel or what equipment you have available.
          </Text>
          <View style={styles.customExample}>
            <Text style={styles.customExampleText}>"Aura, design a 30 min kettlebell session"</Text>
            <MaterialIcons name="north-east" size={14} color={colors.primary} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  backButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.textPrimary, letterSpacing: -0.3 },
  scrollArea: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textSecondary, marginBottom: spacing.md },

  // Workout cards
  card: {
    borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.md,
    backgroundColor: 'rgba(30,41,59,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHero: {
    height: 100, backgroundColor: '#1a1d0a',
    justifyContent: 'center', alignItems: 'center',
  },
  cardContent: { padding: spacing.lg, gap: spacing.xs },
  categoryLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.primary, textTransform: 'uppercase', letterSpacing: 1.5 },
  cardTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.textPrimary, letterSpacing: -0.3 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  cardMeta: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textSecondary },
  selectButton: {
    paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  selectButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.bgDark },

  // Custom workout CTA
  customCard: {
    marginTop: spacing.sm, padding: spacing.lg, borderRadius: radius.md,
    backgroundColor: colors.primaryGhost, borderWidth: 1, borderColor: 'rgba(212,255,0,0.2)',
  },
  customHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  customTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.textPrimary },
  customDescription: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 21, marginBottom: spacing.md },
  customExample: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  customExampleText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.primary },
});
