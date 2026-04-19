import { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../../lib/theme';
import { sendAgentMessage, submitPlanRegeneration, greetUser } from '../../lib/api';
import {
  getLatestPlan, getUserProfile, getCompletedSessionCount, getRecentWorkoutHistory, saveWorkoutPlan,
  getExerciseProgressionData, getLocations, getDefaultLocation, getGreetingData, getRecentProgressSummary,
  getTrainingContext,
} from '../../lib/database';
import { buildUserContext } from '../../lib/contextBuilder';
import { createGreetingPlayer } from '../../lib/greetingPlayer';
import SwapExerciseWidget from '../../components/SwapExerciseWidget';
import ImageMessage from '../../components/ImageMessage';
import InlineWorkoutCard from '../../components/InlineWorkoutCard';
import AuraOrb from '../../components/AuraOrb';
import StreakBanner from '../../components/StreakBanner';
import SmartChips from '../../components/SmartChips';
import ThinkingDots from '../../components/ThinkingDots';
import { renderMd } from '../../lib/renderMd';

const TYPING_DELAY_MS = 700;

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const greetingPlayerRef = useRef(null);

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
  const [streak, setStreak] = useState(0);
  const [weekCompleted, setWeekCompleted] = useState(0);
  const [scriptActive, setScriptActive] = useState(false);

  useEffect(() => {
    loadPlanAndGreet();
  }, []);

  useEffect(() => {
    if (params.selectedDayJson) {
      try {
        const selected = JSON.parse(params.selectedDayJson);
        setTodayWorkout(selected);
        setMessages(prev => [
          ...prev,
          {
            role: 'model',
            text: `Focus changed! We're now doing **${selected.focus}**. Ready when you are.`,
            workoutCard: { focus: selected.focus, exercises: selected.exercises, day: selected.day },
          },
        ]);
      } catch (e) {}
    }
  }, [params.selectedDayJson]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    return () => clearTimeout(t);
  }, [messages, isLoading]);

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
      if (greetingData?.streak != null) setStreak(greetingData.streak);
      if (greetingData?.weekCompleted != null) setWeekCompleted(greetingData.weekCompleted);

      if (savedPlan && Array.isArray(savedPlan)) {
        setPlan(savedPlan);

        if (params.selectedDayJson) return;

        const firstWorkout = savedPlan.find(d => !d.focus.toLowerCase().includes('rest'));
        setTodayWorkout(firstWorkout);

        // Build tree from AI greet endpoint
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

        try {
          const progressSummary = await getRecentProgressSummary();
          // Include recent training so the AI can tailor the progression question.
          const trainingCtx = await getTrainingContext(7).catch(() => null);
          const tree = await greetUser(
            { ...greetingContext, progressSummary, trainingContext: trainingCtx },
            { locationName: defLoc?.name || null, locationsCount: locs.length || 1 },
          );

          const player = createGreetingPlayer(tree);
          const first = player.firstTurn();
          if (first) {
            greetingPlayerRef.current = player;
            setScriptActive(true);
            setMessages([{ role: 'model', text: first.text, chips: first.chips }]);
          } else {
            // Tree missing — fall back to a single plan-reveal message.
            setMessages([{
              role: 'model',
              text: `Ready for today's session? We're focusing on **${firstWorkout?.focus || 'your workout'}**.`,
              workoutCard: firstWorkout ? {
                focus: firstWorkout.focus,
                exercises: firstWorkout.exercises,
                day: firstWorkout.day,
              } : null,
            }]);
          }
        } catch {
          setMessages([{
            role: 'model',
            text: `Ready for today's session? We're focusing on **${firstWorkout?.focus || 'your workout'}**.`,
            workoutCard: firstWorkout ? {
              focus: firstWorkout.focus,
              exercises: firstWorkout.exercises,
              day: firstWorkout.day,
            } : null,
          }]);
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

  // Strip chips from a message in place (used when user picks a chip — prevents double-tap)
  const stripChipsFromLastAura = () => {
    setMessages(prev => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'model' && prev[i].chips) {
          const next = [...prev];
          next[i] = { ...next[i], chips: null };
          return next;
        }
      }
      return prev;
    });
  };

  const handleChipPress = async (chip) => {
    if (isLoading) return;

    // Append user bubble immediately
    setMessages(prev => [...prev, { role: 'user', text: chip }]);
    stripChipsFromLastAura();

    if (scriptActive && greetingPlayerRef.current) {
      const result = greetingPlayerRef.current.advance(chip);

      if (result.kind === 'handoff') {
        setScriptActive(false);
        greetingPlayerRef.current = null;
        // Kick off a live coach request with the prefill message
        setIsLoading(true);
        setTimeout(async () => {
          await sendToCoach(result.prefillMessage);
        }, TYPING_DELAY_MS);
        return;
      }

      if (result.kind === 'message') {
        setIsLoading(true);
        setTimeout(() => {
          setMessages(prev => [
            ...prev,
            {
              role: 'model',
              text: result.text,
              chips: result.chips || null,
              workoutCard: result.showsWorkoutCard && todayWorkout ? {
                focus: todayWorkout.focus,
                exercises: todayWorkout.exercises,
                day: todayWorkout.day,
              } : null,
            },
          ]);
          setIsLoading(false);
          if (greetingPlayerRef.current?.isDone()) {
            setScriptActive(false);
            greetingPlayerRef.current = null;
          }
        }, TYPING_DELAY_MS);
        return;
      }

      // Unknown chip — treat as free text to coach
      await sendToCoach(chip);
      return;
    }

    // Post-script: chips in live AI responses
    await sendToCoach(chip);
  };

  const sendToCoach = async (text) => {
    if (isLoading && !scriptActive) return;
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      }));

      const currentExName = todayWorkout?.exercises?.[0]?.name || null;
      const [progressionResult, trainingResult] = await Promise.allSettled([
        currentExName ? getExerciseProgressionData(currentExName) : Promise.resolve(null),
        getTrainingContext(7),
      ]);
      const progression = progressionResult.status === 'fulfilled' ? progressionResult.value : null;
      const trainingCtx = trainingResult.status === 'fulfilled' ? trainingResult.value : null;

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
        chips: data.chips || null,
      };
      setMessages(prev => [...prev, auraMsg]);

      if (data.workoutCard) {
        const wc = data.workoutCard;
        const exercises = (wc.exercises || []).map(ex => ({
          ...ex,
          targetWeight: ex.targetWeight || '0kg',
        }));
        setTodayWorkout({ focus: wc.focus, exercises, day: todayWorkout?.day });

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

  const handleSend = async (overrideText) => {
    const text = (overrideText ?? inputText).trim();
    if (!text || isLoading) return;

    setInputText('');
    setMessages(prev => [...prev, { role: 'user', text }]);

    // Any free-text message exits the scripted greeting
    if (scriptActive) {
      setScriptActive(false);
      greetingPlayerRef.current = null;
      stripChipsFromLastAura();
    }

    await sendToCoach(text);
  };

  const handleStartWorkout = (workoutOverride) => {
    const workout = workoutOverride || todayWorkout;
    if (workout) {
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

  const handleSwapExercise = (originalExercise, newExerciseName) => {
    if (!todayWorkout?.exercises) return;

    const updatedExercises = todayWorkout.exercises.map(ex =>
      ex.name.toLowerCase() === originalExercise.toLowerCase()
        ? { ...ex, name: newExerciseName }
        : ex
    );
    const updatedWorkout = { ...todayWorkout, exercises: updatedExercises };
    setTodayWorkout(updatedWorkout);

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

  const canSend = inputText.trim().length > 0 && !isLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <AuraOrb size={32} />
          <View>
            <Text style={styles.headerTitle}>Aura</Text>
            <Text style={styles.headerSub}>YOUR COACH · ONLINE</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.headerIcon}
          onPress={() => router.push('/(tabs)/progress')}
          activeOpacity={0.7}
        >
          <MaterialIcons name="show-chart" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Streak banner */}
      <StreakBanner
        streak={streak}
        weekCompleted={weekCompleted}
        weekTotal={userProfile?.days_per_week || 0}
      />

      {/* Plan Regeneration Banner */}
      {showRegenBanner && !isRegenerating && (
        <TouchableOpacity style={styles.regenBanner} onPress={handleRegenerate} activeOpacity={0.8}>
          <MaterialIcons name="auto-awesome" size={18} color={colors.bgDarker} />
          <Text style={styles.regenBannerText}>Your plan is ready for an update</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.bgDarker} />
        </TouchableOpacity>
      )}

      {isRegenerating && (
        <View style={styles.regenBannerLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.regenBannerLoadingText}>Regenerating your plan...</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {messages.map((msg, i) => (
            msg.role === 'user' ? (
              <View key={i} style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{msg.text}</Text>
                </View>
              </View>
            ) : (
              <View key={i} style={styles.auraRow}>
                <AuraOrb size={28} />
                <View style={styles.auraContent}>
                  <Text style={styles.auraText}>{renderMd(msg.text)}</Text>

                  {msg.chips && msg.chips.length > 0 && (
                    <SmartChips chips={msg.chips} onPress={handleChipPress} />
                  )}

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

                  {msg.swapSuggestion && (
                    <SwapExerciseWidget
                      swap={msg.swapSuggestion}
                      onSwap={(newName) => handleSwapExercise(msg.swapSuggestion.original_exercise, newName)}
                    />
                  )}

                  {msg.image && (
                    <ImageMessage image={msg.image} caption={msg.imageCaption} />
                  )}

                  {msg.workoutCard && (
                    <InlineWorkoutCard
                      workout={msg.workoutCard}
                      onStart={handleStartWorkout}
                    />
                  )}
                </View>
              </View>
            )
          ))}

          {isLoading && <ThinkingDots />}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputArea}>
          <View style={styles.inputPill}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Message Aura…"
              placeholderTextColor={colors.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              onPress={() => handleSend()}
              disabled={!canSend}
              activeOpacity={0.8}
            >
              <Ionicons
                name="arrow-up"
                size={18}
                color={canSend ? colors.bgDarker : colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  container: { flex: 1, backgroundColor: colors.bgDarker },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    backgroundColor: colors.bgDarker,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.textPrimary, letterSpacing: -0.3 },
  headerSub: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.textMuted, letterSpacing: 1, marginTop: 1 },

  chatArea: { flex: 1 },
  chatContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },

  // Aura message (faithful variant: orb + plain text, no bubble)
  auraRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  auraContent: { flex: 1, minWidth: 0 },
  auraText: { fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.textPrimary, lineHeight: 22, letterSpacing: -0.1, paddingTop: 3 },

  // User message (solid lime, dark text, asymmetric tail)
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  userBubble: {
    maxWidth: '78%',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 6,
  },
  userText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: colors.bgDarker,
    lineHeight: 21,
    letterSpacing: -0.2,
  },

  // Set card (kept, for log_set results)
  setCard: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryGhost, borderWidth: 1, borderColor: colors.borderSubtle },
  setCardLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.primary, letterSpacing: 1.5, marginBottom: 4 },
  setCardExercise: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.textPrimary, textTransform: 'capitalize', marginBottom: spacing.sm },
  setCardStats: { flexDirection: 'row', gap: spacing.lg },

  // Regeneration banner
  regenBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  regenBannerText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.bgDarker },
  regenBannerLoading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primaryGhost, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  regenBannerLoadingText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textSecondary },

  // Input pill (text + send button inside one rounded container)
  inputArea: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.bgDarker,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgCard,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 10,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(212,255,0,0.15)',
  },
});
