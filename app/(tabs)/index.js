import { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../../lib/theme';
import { sendCoachMessage, submitPlanRegeneration } from '../../lib/api';
import { getLatestPlan, getUserProfile, getCompletedSessionCount, getRecentWorkoutHistory, saveWorkoutPlan, getExerciseProgressionData } from '../../lib/database';

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [inputText, setInputText] = useState('');
  const [userProfile, setUserProfile] = useState(null);
  const [showRegenBanner, setShowRegenBanner] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    loadPlanAndGreet();
  }, []);

  // Handle returning from change-focus screen
  useEffect(() => {
    if (params.selectedDayJson) {
      try {
        const selected = JSON.parse(params.selectedDayJson);
        setTodayWorkout(selected);
        setMessages(prev => [
          ...prev,
          { role: 'model', text: `Focus changed! We're now doing **${selected.focus}**. Ready when you are.` },
        ]);
      } catch (e) {}
    }
  }, [params.selectedDayJson]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  }, [messages]);

  const loadPlanAndGreet = async () => {
    try {
      const [savedPlan, profile, sessionCount] = await Promise.all([
        getLatestPlan(),
        getUserProfile(),
        getCompletedSessionCount(),
      ]);

      if (profile) setUserProfile(profile);
      if (sessionCount >= 7) setShowRegenBanner(true);

      if (savedPlan && Array.isArray(savedPlan)) {
        setPlan(savedPlan);

        // Skip default workout selection if returning from change-focus
        if (!params.selectedDayJson) {
          const firstWorkout = savedPlan.find(d => !d.focus.toLowerCase().includes('rest'));
          setTodayWorkout(firstWorkout);

          setMessages([
            { role: 'model', text: `Great progress! You're into the **"Hypertrophy Foundations"** block.` },
            { role: 'model', text: `Ready for today's session? We're focusing on **${firstWorkout?.focus || 'your workout'}**.` },
          ]);
        }
      } else if (!params.selectedDayJson) {
        setMessages([{ role: 'model', text: "Welcome to Aura. What are we hitting today?" }]);
      }
    } catch (e) {
      console.error(e);
      if (!params.selectedDayJson) {
        setMessages([{ role: 'model', text: "Welcome to Aura. Let's crush today's workout." }]);
      }
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText('');
    const newMsg = { role: 'user', text };
    setMessages(prev => [...prev, newMsg]);
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      }));

      // Fetch progression data for current exercise to pass to coach
      const currentExName = todayWorkout?.exercises?.[0]?.name || null;
      let progression = null;
      if (currentExName) {
        try {
          progression = await getExerciseProgressionData(currentExName);
        } catch {}
      }

      const userContext = {
        goal: userProfile?.goal,
        equipment: userProfile?.equipment,
        currentDay: todayWorkout,
        currentExercise: currentExName,
        planSummary: todayWorkout?.exercises
          ? todayWorkout.exercises.map(e => `${e.name} ${e.sets}x${e.reps} @ ${e.targetWeight}`).join(', ')
          : null,
        progression: progression ? {
          suggestedWeight: progression.suggestedWeight,
          avgRpe: progression.avgRpe,
          isPlateaued: progression.isPlateaued,
          pushReason: progression.pushReason,
        } : null,
      };

      const data = await sendCoachMessage(text, history, userContext);

      setMessages(prev => [
        ...prev,
        {
          role: 'model',
          text: data.text,
          functionCall: data.functionCall,
          swapSuggestion: data.swapSuggestion,
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', text: 'Connection error. Keep pushing!' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartWorkout = () => {
    if (todayWorkout) {
      router.push({ pathname: '/workout-summary', params: { dayJson: JSON.stringify(todayWorkout) } });
    }
  };

  const handleChangeFocus = () => {
    if (plan) {
      router.push({ pathname: '/change-focus', params: { planJson: JSON.stringify(plan) } });
    }
  };

  const handleSwapExercise = (originalExercise, newExerciseName) => {
    if (!todayWorkout?.exercises) return;

    const updatedExercises = todayWorkout.exercises.map(ex =>
      ex.name.toLowerCase() === originalExercise.toLowerCase()
        ? { ...ex, name: newExerciseName }
        : ex
    );
    const updatedWorkout = { ...todayWorkout, exercises: updatedExercises };
    setTodayWorkout(updatedWorkout);

    // Update the plan too so it persists to workout-summary
    if (plan) {
      const updatedPlan = plan.map(day =>
        day.day === todayWorkout.day ? updatedWorkout : day
      );
      setPlan(updatedPlan);
    }

    setMessages(prev => [
      ...prev,
      { role: 'model', text: `Done! **${newExerciseName}** has replaced **${originalExercise}** in your workout. Let's go!` },
    ]);
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setShowRegenBanner(false);
    setMessages(prev => [...prev, { role: 'model', text: "Analyzing your recent performance and updating your plan..." }]);

    try {
      const workoutHistory = await getRecentWorkoutHistory(30);
      const result = await submitPlanRegeneration(
        userProfile,
        plan,
        workoutHistory,
        { daysPerWeek: userProfile?.days_per_week, minutesPerSession: userProfile?.minutes_per_session },
      );

      if (result.plan) {
        await saveWorkoutPlan(result.plan);
        setPlan(result.plan);
        const firstWorkout = result.plan.find(d => !d.focus.toLowerCase().includes('rest'));
        if (firstWorkout) setTodayWorkout(firstWorkout);

        const changesText = result.changes?.length > 0
          ? result.changes.map(c => `• ${c}`).join('\n')
          : 'Minor adjustments based on your performance.';

        setMessages(prev => [
          ...prev,
          { role: 'model', text: `**Plan Updated!** Here's what changed:\n\n${changesText}` },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', text: "Couldn't update the plan right now. We'll try again later." }]);
      setShowRegenBanner(true);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon}>
          <MaterialIcons name="menu" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Project Aura</Text>
        <TouchableOpacity style={styles.headerIcon}>
          <MaterialIcons name="notifications" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Plan Regeneration Banner */}
      {showRegenBanner && !isRegenerating && (
        <TouchableOpacity style={styles.regenBanner} onPress={handleRegenerate} activeOpacity={0.8}>
          <MaterialIcons name="auto-awesome" size={18} color={colors.bgDark} />
          <Text style={styles.regenBannerText}>Your plan is ready for an update</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.bgDark} />
        </TouchableOpacity>
      )}

      {isRegenerating && (
        <View style={styles.regenBannerLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.regenBannerLoadingText}>Regenerating your plan...</Text>
        </View>
      )}

      {/* Chat Feed */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg, i) => (
          <View key={i} style={{ marginBottom: spacing.md }}>
            {msg.role === 'user' ? (
              <View style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{msg.text}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.auraRow}>
                <View style={styles.avatar}>
                  <MaterialIcons name="bolt" size={16} color={colors.bgDark} />
                </View>
                <View style={styles.auraContent}>
                  <Text style={styles.auraLabel}>AURA</Text>
                  <View style={styles.auraBubble}>
                    <Text style={styles.auraText}>{formatBold(msg.text)}</Text>
                  </View>

                  {/* Show logged set widget */}
                  {msg.functionCall && (
                    <View style={styles.setCard}>
                      <Text style={styles.setCardLabel}>SET LOGGED</Text>
                      <Text style={styles.setCardExercise}>{msg.functionCall.exercise_id}</Text>
                      <View style={styles.setCardStats}>
                        <StatPill label="Weight" value={`${msg.functionCall.weight}${msg.functionCall.weight_unit}`} />
                        <StatPill label="Reps" value={msg.functionCall.reps} />
                        {msg.functionCall.rpe && <StatPill label="RPE" value={msg.functionCall.rpe} />}
                      </View>
                    </View>
                  )}

                  {/* Show swap exercise widget */}
                  {msg.swapSuggestion && (
                    <SwapExerciseWidget
                      swap={msg.swapSuggestion}
                      onSwap={(newName) => handleSwapExercise(msg.swapSuggestion.original_exercise, newName)}
                    />
                  )}
                </View>
              </View>
            )}
          </View>
        ))}

        {/* Workout Card */}
        {todayWorkout && messages.length >= 2 && (
          <WorkoutCard day={todayWorkout} onStart={handleStartWorkout} onChangeFocus={handleChangeFocus} />
        )}

        {isLoading && (
          <View style={styles.loadingRow}>
            <View style={styles.loadingDot} />
            <Text style={styles.loadingText}>Aura is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputArea}>
          <View style={styles.inputRow}>
            <View style={styles.inputWrapper}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Type a message or ask Aura..."
                placeholderTextColor={colors.textMuted}
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
              <TouchableOpacity style={styles.micInInput}>
                <MaterialIcons name="mic" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
              <MaterialIcons name="send" size={22} color={colors.bgDark} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatBold(text) {
  if (!text) return '';
  // Simple bold parsing for **text**
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return <Text>{text}</Text>;
  return (
    <Text>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <Text key={i} style={{ fontFamily: 'Inter_700Bold', color: colors.primary }}>{part}</Text>
          : <Text key={i}>{part}</Text>
      )}
    </Text>
  );
}

function StatPill({ label, value }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.textSecondary, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.primary }}>{value}</Text>
    </View>
  );
}

function SwapExerciseWidget({ swap, onSwap }) {
  const [swapped, setSwapped] = useState(null);
  const alternatives = swap.alternatives || [];

  const handleSwap = (name) => {
    setSwapped(name);
    onSwap(name);
  };

  return (
    <View style={swapStyles.container}>
      <View style={swapStyles.header}>
        <View style={swapStyles.headerLeft}>
          <MaterialIcons name="swap-horiz" size={18} color={colors.primary} />
          <Text style={swapStyles.headerTitle}>Swap Exercise</Text>
        </View>
        <Text style={swapStyles.headerCount}>{alternatives.length} Alternatives</Text>
      </View>
      {alternatives.map((alt, idx) => {
        const isSwapped = swapped === alt.name;
        const isDisabled = swapped !== null;
        return (
          <View key={idx} style={[swapStyles.option, idx < alternatives.length - 1 && swapStyles.optionBorder]}>
            <View style={swapStyles.optionIcon}>
              <MaterialIcons name="fitness-center" size={20} color={alt.is_recommended ? colors.primary : colors.textSecondary} style={{ opacity: 0.6 }} />
            </View>
            <View style={swapStyles.optionInfo}>
              <View style={swapStyles.optionNameRow}>
                <Text style={swapStyles.optionName}>{alt.name}</Text>
                {alt.is_recommended && (
                  <View style={swapStyles.recBadge}>
                    <Text style={swapStyles.recBadgeText}>REC</Text>
                  </View>
                )}
              </View>
              <Text style={swapStyles.optionDesc}>{alt.description}</Text>
            </View>
            <TouchableOpacity
              style={[
                swapStyles.swapButton,
                alt.is_recommended && !isDisabled && swapStyles.swapButtonRec,
                isSwapped && swapStyles.swapButtonDone,
                isDisabled && !isSwapped && swapStyles.swapButtonDisabled,
              ]}
              onPress={() => handleSwap(alt.name)}
              disabled={isDisabled}
              activeOpacity={0.7}
            >
              <Text style={[
                swapStyles.swapButtonText,
                alt.is_recommended && !isDisabled && swapStyles.swapButtonTextRec,
                isSwapped && swapStyles.swapButtonTextDone,
                isDisabled && !isSwapped && swapStyles.swapButtonTextDisabled,
              ]}>
                {isSwapped ? 'DONE' : 'SWAP'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const swapStyles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: 'rgba(212,255,0,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
  },
  headerCount: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: colors.textSecondary,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm + 4,
  },
  optionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.bgDarker || colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  optionInfo: {
    flex: 1,
  },
  optionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  optionName: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: colors.textPrimary,
  },
  recBadge: {
    backgroundColor: 'rgba(212,255,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,255,0,0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  recBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  optionDesc: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: colors.textSecondary,
    marginTop: 2,
  },
  swapButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryGhost,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  swapButtonRec: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  swapButtonDone: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderColor: 'rgba(34,197,94,0.3)',
  },
  swapButtonDisabled: {
    opacity: 0.3,
  },
  swapButtonText: {
    fontSize: 11,
    fontFamily: 'Inter_800ExtraBold',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  swapButtonTextRec: {
    color: colors.bgDark,
  },
  swapButtonTextDone: {
    color: 'rgb(34,197,94)',
  },
  swapButtonTextDisabled: {
    color: colors.textSecondary,
  },
});

function WorkoutCard({ day, onStart, onChangeFocus }) {
  const exercisePreview = day.exercises
    ? day.exercises.slice(0, 3).map(e => e.name).join(', ') + (day.exercises.length > 3 ? '...' : '')
    : '';

  return (
    <View style={styles.workoutCard}>
      {/* Hero */}
      <View style={styles.cardHero}>
        <MaterialIcons name="fitness-center" size={64} color="rgba(212,255,0,0.15)" />
        <View style={styles.cardBadge}>
          <Text style={styles.cardBadgeText}>DAILY TARGET</Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{day.focus}</Text>
        <View style={styles.cardMeta}>
          <View style={styles.cardMetaItem}>
            <MaterialIcons name="schedule" size={16} color={colors.textSecondary} />
            <Text style={styles.cardMetaText}>
              {day.exercises ? `${Math.max(30, day.exercises.length * 8)}-${Math.max(40, day.exercises.length * 10)} min` : '45-50 min'}
            </Text>
          </View>
          <View style={styles.cardMetaItem}>
            <MaterialIcons name="fitness-center" size={16} color={colors.textSecondary} />
            <Text style={styles.cardMetaText}>{day.exercises ? `${day.exercises.length} Exercises` : 'Custom'}</Text>
          </View>
        </View>

        {exercisePreview ? (
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>PREVIEW</Text>
            <Text style={styles.previewText}>{exercisePreview}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.startButton} onPress={onStart} activeOpacity={0.8}>
          <Text style={styles.startButtonText}>Start Workout</Text>
          <MaterialIcons name="play-circle-fill" size={22} color={colors.bgDark} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.changeFocusButton} onPress={onChangeFocus} activeOpacity={0.7}>
          <MaterialIcons name="sync" size={18} color={colors.textMuted} />
          <Text style={styles.changeFocusText}>CHANGE FOCUS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primaryFaint, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.textPrimary, letterSpacing: -0.3 },
  chatArea: { flex: 1 },
  chatContent: { padding: spacing.md, paddingBottom: 120 },

  // Aura
  auraRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  auraContent: { flex: 1, maxWidth: '85%' },
  auraLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.textMuted, letterSpacing: 1, marginBottom: 4, marginLeft: 2 },
  auraBubble: { backgroundColor: colors.primaryGhost, borderRadius: radius.lg, borderTopLeftRadius: 0, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSubtle },
  auraText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textPrimary, lineHeight: 21 },

  // User
  userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: { maxWidth: '80%', padding: spacing.md, borderRadius: radius.lg, borderTopRightRadius: 0, backgroundColor: colors.primaryFaint, borderWidth: 1, borderColor: 'rgba(212,255,0,0.3)' },
  userText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.primary },

  // Set card
  setCard: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryGhost, borderWidth: 1, borderColor: colors.borderSubtle },
  setCardLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.primary, letterSpacing: 1.5, marginBottom: 4 },
  setCardExercise: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.textPrimary, textTransform: 'capitalize', marginBottom: spacing.sm },
  setCardStats: { flexDirection: 'row', gap: spacing.lg },

  // Loading
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.bgCard, borderRadius: radius.md, alignSelf: 'flex-start' },
  loadingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  loadingText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary },

  // Workout Card
  workoutCard: { marginLeft: spacing.xxl, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(212,255,0,0.2)', marginBottom: spacing.lg },
  cardHero: { height: 160, backgroundColor: '#1a1d0a', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  cardBadge: { position: 'absolute', bottom: 12, left: 12, backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  cardBadgeText: { fontSize: 10, fontFamily: 'Inter_800ExtraBold', color: colors.bgDark, letterSpacing: -0.3 },
  cardBody: { padding: spacing.lg, gap: spacing.md, backgroundColor: 'rgba(15,23,42,0.4)' },
  cardTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.textPrimary, letterSpacing: -0.5 },
  cardMeta: { flexDirection: 'row', gap: spacing.md },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary },
  previewBox: { backgroundColor: colors.primaryGhost, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primaryGhost },
  previewLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textMuted, letterSpacing: 2, marginBottom: 4 },
  previewText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, fontStyle: 'italic' },
  startButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radius.lg,
  },
  startButtonText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.bgDark },
  changeFocusButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  changeFocusText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textMuted, letterSpacing: 2 },

  // Regeneration banner
  regenBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  regenBannerText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.bgDark },
  regenBannerLoading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primaryGhost, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  regenBannerLoadingText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textSecondary },

  // Input
  inputArea: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inputWrapper: { flex: 1, position: 'relative' },
  input: {
    backgroundColor: colors.primaryGhost, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: 14, paddingRight: 48,
    color: colors.textPrimary, fontSize: 14, fontFamily: 'Inter_400Regular',
  },
  micInInput: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  sendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
});
