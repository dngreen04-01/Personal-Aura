import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../lib/theme';
import { sendCoachMessage } from '../lib/api';
import { getUserProfile } from '../lib/database';
import SwapExerciseWidget from '../components/SwapExerciseWidget';

export default function WorkoutSummaryScreen() {
  const router = useRouter();
  const { dayJson } = useLocalSearchParams();
  const day = dayJson ? JSON.parse(dayJson) : null;

  const [exercises, setExercises] = useState(day?.exercises || []);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    getUserProfile().then(setUserProfile).catch(() => {});
  }, []);

  const totalSets = exercises.reduce((sum, e) => sum + (parseInt(e.sets) || 3), 0);
  const estMinutes = Math.max(30, exercises.length * 8);
  const intensity = totalSets > 18 ? 'High' : totalSets > 12 ? 'Medium' : 'Light';

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText('');
    setAiResponse(null);
    setIsLoading(true);

    try {
      const userContext = {
        goal: userProfile?.goal,
        equipment: userProfile?.equipment,
        currentDay: { ...day, exercises },
        planSummary: exercises
          .map(e => `${e.name} ${e.sets}x${e.reps} @ ${e.targetWeight}`)
          .join(', '),
      };

      const data = await sendCoachMessage(text, [], userContext);
      setAiResponse({
        text: data.text,
        swapSuggestion: data.swapSuggestion,
      });
    } catch (err) {
      console.error(err);
      setAiResponse({ text: 'Connection error. Try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwapExercise = (originalExercise, newExerciseName) => {
    setExercises(prev =>
      prev.map(ex =>
        ex.name.toLowerCase() === originalExercise.toLowerCase()
          ? { ...ex, name: newExerciseName }
          : ex
      )
    );
    setAiResponse(null);
  };

  const handleStart = () => {
    router.replace({
      pathname: '/workout',
      params: {
        dayJson: JSON.stringify({ ...day, exercises }),
        startIdx: String(selectedIdx),
      },
    });
  };

  if (!day) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 100 }}>No workout data</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerLabel}>PROJECT AURA</Text>
          <Text style={styles.headerTitle}>{day.focus}</Text>
        </View>
        <TouchableOpacity style={styles.headerButton}>
          <MaterialIcons name="more-vert" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={styles.statIcon}>
            <MaterialIcons name="schedule" size={14} color={colors.textSecondary} />
            <Text style={styles.statLabel}>Duration</Text>
          </View>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{estMinutes} min</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statIcon}>
            <MaterialIcons name="fitness-center" size={14} color={colors.textSecondary} />
            <Text style={styles.statLabel}>Total Sets</Text>
          </View>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{totalSets}</Text>
        </View>
        <View style={[styles.statCard, styles.statCardAccent]}>
          <View style={styles.statIcon}>
            <MaterialIcons name="bolt" size={14} color={colors.primary} />
            <Text style={[styles.statLabel, { color: colors.primary, opacity: 0.8 }]}>Intensity</Text>
          </View>
          <Text style={[styles.statValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>{intensity}</Text>
        </View>
      </View>

      {/* Exercise List */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>EXERCISE LIST</Text>
        <Text style={styles.listCount}>{exercises.length} Exercises</Text>
      </View>

      <ScrollView
        style={styles.listArea}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {exercises.map((exercise, i) => {
          const isSelected = i === selectedIdx;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.exerciseRow, isSelected && styles.exerciseRowSelected]}
              onPress={() => setSelectedIdx(i)}
              activeOpacity={0.7}
            >
              <View style={[styles.exerciseThumb, isSelected && styles.exerciseThumbSelected]}>
                <MaterialIcons
                  name="fitness-center"
                  size={24}
                  color={isSelected ? colors.bgDark : 'rgba(212,255,0,0.2)'}
                />
              </View>
              <View style={styles.exerciseInfo}>
                <Text style={[styles.exerciseName, isSelected && styles.exerciseNameSelected]}>
                  {exercise.name}
                </Text>
                <Text style={[styles.exerciseMeta, isSelected && styles.exerciseMetaSelected]}>
                  {exercise.sets} sets x {exercise.reps} reps
                </Text>
              </View>
              {isSelected ? (
                <View style={styles.playIcon}>
                  <MaterialIcons name="play-arrow" size={20} color={colors.primary} />
                </View>
              ) : (
                <MaterialIcons name="drag-indicator" size={20} color="rgba(255,255,255,0.2)" />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Bottom Section */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.bottomSection}>
          {/* Aura chat prompt */}
          <View style={styles.auraPrompt}>
            <View style={styles.auraPromptIcon}>
              <MaterialIcons name="auto-awesome" size={18} color={colors.bgDark} />
            </View>
            <TextInput
              style={styles.auraPromptInput}
              placeholder="Ask Aura to modify workout..."
              placeholderTextColor={colors.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={handleSend} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialIcons name="send" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>

          {/* AI Response Area */}
          {(isLoading || aiResponse) && (
            <View style={styles.aiResponseContainer}>
              {isLoading && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingText}>Aura is thinking...</Text>
                </View>
              )}
              {aiResponse?.text && (
                <Text style={styles.aiResponseText}>{aiResponse.text}</Text>
              )}
              {aiResponse?.swapSuggestion && (
                <SwapExerciseWidget
                  swap={aiResponse.swapSuggestion}
                  onSwap={(newName) => handleSwapExercise(aiResponse.swapSuggestion.original_exercise, newName)}
                />
              )}
            </View>
          )}

          {/* Start CTA */}
          <TouchableOpacity style={styles.startButton} onPress={handleStart} activeOpacity={0.85}>
            <Text style={styles.startButtonText}>
              START {exercises[selectedIdx]?.name?.toUpperCase() || 'WORKOUT'}
            </Text>
            <MaterialIcons name="arrow-forward-ios" size={18} color={colors.bgDark} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarker },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  headerButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(45,49,21,1)', justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.primary, letterSpacing: 3 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.white, letterSpacing: -0.3, marginTop: 2 },

  // Stats
  statsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  statCard: {
    flex: 1, padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: '#1e210e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', gap: 4,
  },
  statCardAccent: { borderColor: 'rgba(212,255,0,0.1)' },
  statIcon: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 20, fontFamily: 'Inter_800ExtraBold', color: colors.white },

  // List header
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  listTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.white, letterSpacing: 2 },
  listCount: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textSecondary },

  // List
  listArea: { flex: 1 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },

  // Exercise row
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: 4, paddingRight: spacing.md, borderRadius: radius.lg,
    backgroundColor: '#1e210e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  exerciseRowSelected: {
    backgroundColor: colors.primary, borderColor: 'rgba(212,255,0,0.2)',
  },
  exerciseThumb: {
    width: 56, height: 56, borderRadius: radius.md,
    backgroundColor: 'rgba(212,255,0,0.05)', justifyContent: 'center', alignItems: 'center',
  },
  exerciseThumbSelected: { backgroundColor: 'rgba(18,20,8,0.2)' },
  exerciseInfo: { flex: 1, gap: 2 },
  exerciseName: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.white },
  exerciseNameSelected: { color: colors.bgDark },
  exerciseMeta: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textSecondary },
  exerciseMetaSelected: { color: 'rgba(18,20,8,0.7)' },
  playIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.bgDarker, justifyContent: 'center', alignItems: 'center',
  },

  // Bottom
  bottomSection: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm,
  },
  auraPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(45,49,21,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  auraPromptIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  auraPromptInput: {
    flex: 1, color: colors.textPrimary, fontSize: 14, fontFamily: 'Inter_400Regular',
    paddingVertical: spacing.sm,
  },

  // AI Response
  aiResponseContainer: {
    backgroundColor: 'rgba(45,49,21,0.5)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  aiResponseText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textSecondary,
  },

  startButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingVertical: 18, borderRadius: radius.lg,
    shadowColor: colors.primary, shadowOpacity: 0.4, shadowOffset: { width: 0, height: 0 }, shadowRadius: 30,
  },
  startButtonText: { fontSize: 16, fontFamily: 'Inter_800ExtraBold', color: colors.bgDark, letterSpacing: 0.5 },
});
