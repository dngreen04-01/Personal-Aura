import { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../../lib/theme';
import { sendAgentMessage, submitPlanRegeneration, greetUser } from '../../lib/api';
import { getLatestPlan, getUserProfile, getCompletedSessionCount, getRecentWorkoutHistory, saveWorkoutPlan, getExerciseProgressionData, getLocations, getDefaultLocation, getGreetingData, getRecentProgressSummary, getTrainingContext } from '../../lib/database';
import { buildUserContext } from '../../lib/contextBuilder';
import { buildGreetingCacheKey, getCachedGreeting, cacheGreeting } from '../../lib/greetingCache';
import SwapExerciseWidget from '../../components/SwapExerciseWidget';
import ImageMessage from '../../components/ImageMessage';
import InlineWorkoutCard from '../../components/InlineWorkoutCard';

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
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);

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
      const [savedPlan, profile, sessionCount, locs, defLoc, greetingData] = await Promise.all([
        getLatestPlan(),
        getUserProfile(),
        getCompletedSessionCount(),
        getLocations(),
        getDefaultLocation(),
        getGreetingData(),
      ]);

      if (profile) setUserProfile(profile);
      if (sessionCount >= 7) setShowRegenBanner(true);
      if (locs.length > 0) setLocations(locs);
      if (defLoc) setSelectedLocation(defLoc);

      if (savedPlan && Array.isArray(savedPlan)) {
        setPlan(savedPlan);

        if (!params.selectedDayJson) {
          const firstWorkout = savedPlan.find(d => !d.focus.toLowerCase().includes('rest'));
          setTodayWorkout(firstWorkout);

          // AI greeting with cache — instant on repeat opens
          const greetingContext = {
            goal: profile?.goal,
            equipment: profile?.equipment,
            streak: greetingData.streak,
            sessionCount: greetingData.sessionCount,
            lastWorkoutFocus: greetingData.lastWorkoutFocus,
            lastWorkoutDate: greetingData.lastWorkoutDate,
            todayFocus: firstWorkout?.focus,
            todayExerciseCount: firstWorkout?.exercises?.length,
          };

          const cacheKey = buildGreetingCacheKey(greetingContext);
          const cached = await getCachedGreeting(cacheKey);

          if (cached) {
            setMessages([{ role: 'model', text: cached.text }]);
          } else {
            try {
              const progressSummary = await getRecentProgressSummary();
              const greeting = await greetUser({ ...greetingContext, progressSummary });
              setMessages([{ role: 'model', text: greeting.text }]);
              cacheGreeting(cacheKey, greeting.text);
            } catch {
              setMessages([
                { role: 'model', text: `Ready for today's session? We're focusing on **${firstWorkout?.focus || 'your workout'}**.` },
              ]);
            }
          }
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

      // Fetch progression data and training history in parallel
      const currentExName = todayWorkout?.exercises?.[0]?.name || null;
      let progression = null;
      let trainingCtx = null;
      const [progressionResult, trainingResult] = await Promise.allSettled([
        currentExName ? getExerciseProgressionData(currentExName) : Promise.resolve(null),
        getTrainingContext(7),
      ]);
      if (progressionResult.status === 'fulfilled') progression = progressionResult.value;
      if (trainingResult.status === 'fulfilled') trainingCtx = trainingResult.value;

      const userContext = buildUserContext({
        profile: userProfile,
        workout: todayWorkout,
        exercise: { name: currentExName },
        progression,
        location: selectedLocation,
        trainingContext: trainingCtx,
      });

      const data = await sendAgentMessage(text, history, userContext);

      const auraMsg = {
        role: 'model',
        text: data.text,
        functionCall: data.functionCall,
        swapSuggestion: data.swapSuggestion,
        workoutCard: data.workoutCard,
        image: data.image,
        imageCaption: data.imageCaption,
      };
      setMessages(prev => [...prev, auraMsg]);

      // If workoutCard received, update todayWorkout state
      if (data.workoutCard) {
        const wc = data.workoutCard;
        // Ensure all exercises have a targetWeight (fallback to "0kg" if AI returned null)
        const exercises = (wc.exercises || []).map(ex => ({
          ...ex,
          targetWeight: ex.targetWeight || '0kg',
        }));
        setTodayWorkout({ focus: wc.focus, exercises, day: todayWorkout?.day });

        // Persist custom/adjusted workouts to plan so they survive round-trips
        if (wc.modificationType === 'adjust' && plan) {
          const updatedPlan = plan.map(day =>
            day.day === todayWorkout?.day ? { ...day, exercises, focus: wc.focus } : day
          );
          setPlan(updatedPlan);
          await saveWorkoutPlan(updatedPlan);
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', text: "Couldn't reach Aura right now. Try again in a moment." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartWorkout = (workoutOverride) => {
    const workout = workoutOverride || todayWorkout;
    if (workout) {
      // Ensure todayWorkout state is in sync with what we're starting
      if (workoutOverride) {
        setTodayWorkout(prev => ({ ...prev, focus: workout.focus, exercises: workout.exercises }));
      }
      router.push({
        pathname: '/workout-summary',
        params: {
          dayJson: JSON.stringify(workout),
          ...(selectedLocation ? { locationJson: JSON.stringify(selectedLocation) } : {}),
        },
      });
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}>
        {/* Chat Feed */}
        <ScrollView
          ref={scrollRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
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

                    {/* Show exercise image */}
                    {msg.image && (
                      <ImageMessage image={msg.image} caption={msg.imageCaption} />
                    )}

                    {/* Show inline workout card */}
                    {msg.workoutCard && (
                      <InlineWorkoutCard
                        workout={msg.workoutCard}
                        onStart={handleStartWorkout}
                      />
                    )}
                  </View>
                </View>
              )}
            </View>
          ))}

          {isLoading && (
            <View style={styles.loadingRow}>
              <View style={styles.loadingDot} />
              <Text style={styles.loadingText}>Aura is thinking...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputArea}>
          <View style={styles.inputRow}>
            <View style={styles.inputWrapper}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Message Aura..."
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
  chatContent: { padding: spacing.md, paddingBottom: spacing.md },

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

  // Input — coaching zone
  inputArea: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1.5, borderTopColor: 'rgba(212,255,0,0.2)', backgroundColor: 'rgba(18,20,8,0.5)' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inputWrapper: { flex: 1, position: 'relative' },
  input: {
    backgroundColor: 'rgba(212,255,0,0.06)', borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: 14, paddingRight: 48,
    color: colors.textPrimary, fontSize: 15, fontFamily: 'Inter_400Regular',
    borderWidth: 1.5, borderColor: 'rgba(212,255,0,0.25)',
  },
  micInInput: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  sendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
});
