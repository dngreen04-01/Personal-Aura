import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, fonts } from '../lib/theme';
import { EXERCISE_CATEGORIES } from '../lib/muscleGroups';
import { fetchExercises } from '../lib/api';
import {
  cacheExercises, getCachedExercises, getExerciseCacheAge,
} from '../lib/database';
import SearchBar from '../components/progress/SearchBar';
import CategoryChips from '../components/progress/CategoryChips';
import ExerciseDetail from '../components/ExerciseDetail';

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const DIFFICULTY_OPTIONS = ['All', 'beginner', 'intermediate', 'advanced'];

export default function ExerciseBrowserScreen() {
  const router = useRouter();
  const [exercises, setExercises] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeDifficulty, setActiveDifficulty] = useState('All');
  const [selectedExercise, setSelectedExercise] = useState(null);
  const searchTimerRef = useRef(null);

  // Load exercises on mount
  useEffect(() => {
    loadExercises();
  }, []);

  const loadExercises = async () => {
    setIsLoading(true);
    try {
      const oldest = await getExerciseCacheAge();
      const isFresh = oldest && (Date.now() - new Date(oldest).getTime()) < CACHE_MAX_AGE_MS;

      if (!isFresh) {
        // Fetch from API and cache
        try {
          const data = await fetchExercises();
          if (data.exercises?.length > 0) {
            await cacheExercises(data.exercises);
          }
        } catch (apiErr) {
          console.warn('Failed to fetch exercises from API, using cache:', apiErr.message);
        }
      }

      const cached = await getCachedExercises();
      setExercises(cached);
    } catch (e) {
      console.error('Failed to load exercises:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Re-query local cache when filters change
  useEffect(() => {
    if (isLoading) return;
    filterExercises();
  }, [activeCategory, activeDifficulty]);

  const filterExercises = useCallback(async (overrideSearch) => {
    try {
      const cached = await getCachedExercises({
        category: activeCategory !== 'All' ? activeCategory : undefined,
        difficulty: activeDifficulty !== 'All' ? activeDifficulty : undefined,
        search: overrideSearch !== undefined ? overrideSearch : searchText,
      });
      setExercises(cached);
    } catch (e) {
      console.error('Filter error:', e);
    }
  }, [activeCategory, activeDifficulty, searchText]);

  // Debounced search
  const handleSearch = useCallback((text) => {
    setSearchText(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      filterExercises(text);
    }, 300);
  }, [filterExercises]);

  const renderExercise = useCallback(({ item }) => (
    <TouchableOpacity
      style={styles.exerciseCard}
      onPress={() => setSelectedExercise(item)}
      activeOpacity={0.7}
    >
      <View style={styles.exerciseIcon}>
        <MaterialIcons name="fitness-center" size={22} color={colors.primary} />
      </View>
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.exerciseMeta} numberOfLines={1}>
          {(item.primaryMuscles || []).join(', ')}
        </Text>
      </View>
      <View style={styles.exerciseBadges}>
        {(item.equipment || []).slice(0, 2).map(eq => (
          <View key={eq} style={styles.eqBadge}>
            <Text style={styles.eqBadgeText}>{eq}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  ), []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Exercise Library</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search */}
      <View style={styles.filterSection}>
        <SearchBar value={searchText} onChangeText={handleSearch} />
        <CategoryChips
          categories={EXERCISE_CATEGORIES}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
        />
        {/* Difficulty filter */}
        <CategoryChips
          categories={DIFFICULTY_OPTIONS}
          activeCategory={activeDifficulty}
          onSelect={setActiveDifficulty}
        />
      </View>

      {/* Exercise List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading exercises...</Text>
        </View>
      ) : exercises.length === 0 ? (
        <View style={styles.centered}>
          <MaterialIcons name="search-off" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No exercises found</Text>
        </View>
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
          renderItem={renderExercise}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Detail Modal */}
      <ExerciseDetail
        exercise={selectedExercise}
        visible={!!selectedExercise}
        onClose={() => setSelectedExercise(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    ...fonts.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  filterSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  exerciseIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryGhost,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseInfo: {
    flex: 1,
    gap: 2,
  },
  exerciseName: {
    ...fonts.semibold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  exerciseMeta: {
    ...fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  exerciseBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    maxWidth: 100,
    justifyContent: 'flex-end',
  },
  eqBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryGhost,
  },
  eqBadgeText: {
    ...fonts.medium,
    fontSize: 10,
    color: colors.primaryDim,
    textTransform: 'capitalize',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyText: {
    ...fonts.medium,
    fontSize: 16,
    color: colors.textSecondary,
  },
});
