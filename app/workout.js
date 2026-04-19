import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
  Image, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../lib/theme';
import { endSession, getSessionStats, logStrengthSet, getTrainingContext, setExerciseUnitPreference } from '../lib/database';
import { sendAgentMessage, generateExerciseImage, generateWorkoutCard } from '../lib/api';
import ExerciseDetail from '../components/ExerciseDetail';
import TransitionModal from '../components/workout/TransitionModal';
import ExerciseHub from '../components/ExerciseHub';
import RestBottomSheet from '../components/RestBottomSheet';
import WorkoutExerciseCard from '../components/WorkoutExerciseCard';
import AuraOrb from '../components/AuraOrb';
import { renderMd } from '../lib/renderMd';
import { buildUserContext } from '../lib/contextBuilder';
import { convertWeight, formatWeight, getIncrements, getDefaultIncrement, snapToIncrement } from '../lib/weightUtils';
import { evaluateSet, checkMilestone } from '../lib/motivation';
import useRestTimer from '../hooks/useRestTimer';
import useExerciseState from '../hooks/useExerciseState';
import useWorkoutSession from '../hooks/useWorkoutSession';
import BlockRouter from '../components/workout/BlockRouter';

export default function WorkoutScreen() {
  const router = useRouter();
  const { dayJson, startIdx, locationJson, resumeSessionId } = useLocalSearchParams();
  let day = null;
  let location = null;
  try { day = dayJson ? JSON.parse(dayJson) : null; } catch (_) {}
  try { location = locationJson ? JSON.parse(locationJson) : null; } catch (_) {}

  const exercises = day?.exercises || [];
  const inputRef = useRef(null);

  // --- Session lifecycle hook ---
  const session = useWorkoutSession({ day, location, startIdx, resumeSessionId, exercises });
  const {
    sessionId, userProfile, blockMap, sessionBlocks,
    currentExIdx, setCurrentExIdx,
    currentSet, setCurrentSet,
    completedExercises, setCompletedExercises,
    exerciseSets, setExerciseSets,
  } = session;

  // Determine if current block is non-strength (needs adapter routing)
  const currentBlock = sessionBlocks[currentExIdx] || null;
  const isStrengthBlock = !currentBlock || currentBlock.block_type === 'strength';

  const currentExercise = exercises[currentExIdx];
  const totalSets = parseInt(currentExercise?.sets) || 4;
  const targetReps = parseInt(currentExercise?.reps) || 8;
  const restDuration = parseInt(currentExercise?.restSeconds) || 90;

  // --- Exercise state hook ---
  const exState = useExerciseState({ exercises, currentExIdx, userProfile });
  const {
    weight, setWeight,
    lastLoggedWeight, setLastLoggedWeight,
    reps, setReps,
    rpe, setRpe,
    weightUnit, setWeightUnit,
    weightBadge,
    isEstimatedWeight, setIsEstimatedWeight,
    pushSuggestion, setPushSuggestion,
    exerciseMaxWeight, streakData, completedSessions,
    weightIncrement, setWeightIncrement,
    libraryExercise,
    exerciseImage, setExerciseImage,
    isEditingWeight, setIsEditingWeight,
    weightInputText, setWeightInputText,
  } = exState;

  // --- Rest timer hook ---
  const timer = useRestTimer({
    sessionId,
    currentExercise,
    currentSet,
    totalSets,
    currentExIdx,
    totalExercises: exercises.length,
    restDuration,
    day,
    completedExercises,
    exerciseSets,
  });
  const {
    isResting, restRemaining, alarmFired,
    startRest, handleBeginSet, handleExtendRest, handleSkipRest,
    recoverTimer, pendingAdvanceRef,
  } = timer;

  // --- Local UI state ---
  const [inputText, setInputText] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [completeStats, setCompleteStats] = useState(null);
  const [completeMessage, setCompleteMessage] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [shareImage, setShareImage] = useState(null);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [showExerciseDetail, setShowExerciseDetail] = useState(false);
  const [showExerciseHub, setShowExerciseHub] = useState(false);

  // Recover timer on mount — reads SQLite, re-arms countdown or fires the
  // Begin Set modal if the timer already expired while the user was away.
  useEffect(() => { recoverTimer(); }, [recoverTimer]);

  // --- Derived ---
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const totalLoggedSets = Object.values(exerciseSets).reduce((sum, n) => sum + n, 0);
  const grandTotalSets = exercises.reduce((sum, e) => sum + (parseInt(e.sets) || 3), 0);
  const progressPercent = grandTotalSets > 0 ? Math.round((totalLoggedSets / grandTotalSets) * 100) : 0;

  // --- Handlers ---

  const handleShowMe = async () => {
    if (exerciseImage) { setExerciseImage(null); return; }
    setIsImageLoading(true);
    try {
      const result = await generateExerciseImage(currentExercise.name, userProfile?.equipment || null);
      setExerciseImage(result);
    } catch (err) {
      console.error('Image generation failed:', err.message);
      setAiResponse({ text: 'Could not generate image right now.' });
    } finally {
      setIsImageLoading(false);
    }
  };

  const handleShareWorkout = async () => {
    if (!completeStats) return;
    setIsShareLoading(true);
    try {
      const result = await generateWorkoutCard(completeStats);
      setShareImage(result);
    } catch (err) {
      console.error('Share card generation failed:', err.message);
    } finally {
      setIsShareLoading(false);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isAiLoading) return;
    setInputText('');
    setAiResponse(null);
    setIsAiLoading(true);
    try {
      let trainingCtx = null;
      try { trainingCtx = await getTrainingContext(7); } catch {}
      const userContext = buildUserContext({
        profile: userProfile,
        exercise: {
          name: currentExercise?.name,
          currentSet: `Set ${currentSet} of ${totalSets}`,
          targetReps,
          currentWeight: weight,
          weightUnit,
          isResting,
        },
        location,
        motivation: { exerciseMaxWeight, streakData, completedSessions },
        trainingContext: trainingCtx,
      });
      const data = await sendAgentMessage(text, [], userContext);
      setAiResponse({ text: data.text });
    } catch {
      setAiResponse({ text: "Couldn't reach Aura right now. Keep pushing!" });
    } finally {
      setIsAiLoading(false);
    }
  };

  const totalBlocks = exercises.length || sessionBlocks.length;
  const willAllBeComplete = (nextCompletedIdx) => {
    const next = new Set(completedExercises);
    if (nextCompletedIdx != null) next.add(nextCompletedIdx);
    return next.size >= totalBlocks;
  };

  const handleDone = async () => {
    // Dual-write: legacy workout_sets + block_entries
    if (sessionId && currentExercise) {
      await logStrengthSet(
        sessionId, blockMap[currentExercise.name] || null,
        currentExercise.name, currentSet, weight, weightUnit, reps, rpe, restDuration
      );
    }
    setLastLoggedWeight(weight);

    // Track logged sets per exercise index
    setExerciseSets(prev => ({ ...prev, [currentExIdx]: (prev[currentExIdx] || 0) + 1 }));

    // Mark exercise complete when all sets are done
    if (currentSet >= totalSets) {
      setCompletedExercises(prev => new Set(prev).add(currentExIdx));
    }

    // Motivation Engine
    if (rpe !== null) {
      const evaluation = evaluateSet({
        rpe,
        goal: userProfile?.goal,
        currentWeight: weight,
        weightUnit,
        exerciseName: currentExercise.name,
      });

      const milestone = checkMilestone({
        currentWeight: weight,
        exerciseMaxWeight,
        streakData,
        completedSessions,
      });

      setAiResponse({ text: evaluation.messageHint });

      if (milestone) {
        setCelebration(milestone);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setCelebration(null), 3000);
      }

      if (evaluation.tone === 'push' && evaluation.weightAdjustment && currentSet < totalSets) {
        const adjKg = evaluation.weightAdjustment.value;
        const increment = weightUnit === 'lbs' ? Math.round(adjKg * 2.20462) : adjKg;
        setWeight(w => w + increment);
      }
    }

    if (isEstimatedWeight) setIsEstimatedWeight(false);

    // Determine what happens after rest
    let afterRestCallback = null;
    if (currentSet >= totalSets) {
      if (willAllBeComplete(currentExIdx)) {
        const sid = sessionId;
        afterRestCallback = async () => {
          if (sid) await endSession(sid);
          router.replace({
            pathname: '/workout-complete',
            params: { sessionId: sid || '', focus: day?.focus || '' },
          });
        };
      } else {
        afterRestCallback = () => setShowExerciseHub(true);
      }
    } else {
      setCurrentSet(prev => prev + 1);
    }

    startRest(currentExercise.name, restDuration, afterRestCallback);
  };

  const handleSkipRestWithFallback = () => {
    handleSkipRest();
    // If skip during exercise transition, show hub
    if (currentSet > totalSets && currentExIdx < exercises.length - 1) {
      setShowExerciseHub(true);
    }
  };

  // Find the next incomplete exercise
  const suggestedNextIdx = (() => {
    for (let i = 0; i < exercises.length; i++) {
      if (!completedExercises.has(i) && !(exerciseSets[i] > 0)) return i;
    }
    for (let i = 0; i < exercises.length; i++) {
      if (!completedExercises.has(i)) return i;
    }
    return null;
  })();

  const handleExerciseHubSelect = (idx) => {
    setShowExerciseHub(false);
    setCurrentExIdx(idx);
    setCurrentSet(1);
  };

  const handleClose = async () => {
    if (sessionId && !showComplete) await endSession(sessionId);
    router.back();
  };

  if (!day || (!currentExercise && isStrengthBlock)) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 100 }}>No workout data</Text>
      </SafeAreaView>
    );
  }

  // Determine TransitionModal variant
  const transitionVariant = (() => {
    if (currentSet >= totalSets && willAllBeComplete(currentExIdx)) return 'workout_complete';
    if (currentSet >= totalSets) return 'exercise_complete';
    return 'begin_set';
  })();

  const focusLabel = (day?.focus || '').split(' ')[0].toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      {/* Slim Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerSide} onPress={handleClose} hitSlop={8}>
          <MaterialIcons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerKicker}>
            <Text style={styles.headerKickerAccent}>Ex {currentExIdx + 1}</Text>
            <Text style={styles.headerKickerFaint}> / {exercises.length || sessionBlocks.length}</Text>
            {focusLabel ? (
              <>
                <Text style={styles.headerKickerDot}>  ·  </Text>
                <Text style={styles.headerKickerFocus}>{focusLabel}</Text>
              </>
            ) : null}
          </Text>
        </View>
        <View style={styles.headerSide} />
      </View>

      {/* Celebration Banner */}
      {celebration && (
        <View style={styles.celebrationBanner}>
          <MaterialIcons name="emoji-events" size={18} color={colors.bgDark} />
          <Text style={styles.celebrationText}>{celebration.message}</Text>
        </View>
      )}

      {/* Slim progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {/* Main Content */}
      {!isStrengthBlock ? (
        /* Non-strength block: render the appropriate adapter via BlockRouter */
        <View style={styles.mainScroll}>
          <BlockRouter
            block={currentBlock}
            sessionId={sessionId}
            blockPosition={`Block ${currentExIdx + 1} of ${exercises.length || sessionBlocks.length}`}
            onBlockComplete={() => {
              setCompletedExercises(prev => new Set(prev).add(currentExIdx));
              if (willAllBeComplete(currentExIdx)) {
                (async () => {
                  if (sessionId) await endSession(sessionId);
                  router.replace({
                    pathname: '/workout-complete',
                    params: { sessionId: sessionId || '', focus: day?.focus || '' },
                  });
                })();
              } else {
                setShowExerciseHub(true);
              }
            }}
          />
        </View>
      ) : (
      <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}>
        <WorkoutExerciseCard
          exercise={currentExercise}
          currentSet={currentSet}
          totalSets={totalSets}
          weight={weight}
          onWeightChange={setWeight}
          reps={reps}
          onRepsChange={setReps}
          weightUnit={weightUnit}
          weightIncrement={weightIncrement}
          lastLoggedWeight={lastLoggedWeight}
          targetReps={targetReps}
          onLog={handleDone}
          category={currentExercise?.category || 'Strength'}
          cue={currentExercise?.cue || currentExercise?.notes}
        />

        {/* Coach tip */}
        {pushSuggestion && (
          <View style={styles.coachTip}>
            <AuraOrb size={22} />
            <Text style={styles.coachTipText}>{renderMd(pushSuggestion)}</Text>
          </View>
        )}

        {/* Up Next */}
        {exercises.length > currentExIdx + 1 && (
          <View style={styles.upNext}>
            <Text style={styles.upNextLabel}>UP NEXT</Text>
            {exercises.slice(currentExIdx + 1, currentExIdx + 4).map((ex, i) => (
              <View key={`${ex.name}-${i}`} style={styles.upNextRow}>
                <View style={styles.upNextNum}>
                  <Text style={styles.upNextNumText}>{currentExIdx + 2 + i}</Text>
                </View>
                <Text style={styles.upNextName} numberOfLines={1}>{ex.name}</Text>
                <Text style={styles.upNextMeta}>
                  {ex.sets || 3}×{ex.reps || ex.targetReps || '—'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      )}

      {/* Floating rest timer overlay */}
      {isResting && isStrengthBlock && (
        <View style={styles.restOverlay} pointerEvents="box-none">
          <RestBottomSheet
            secondsLeft={restRemaining}
            totalSeconds={restDuration || 1}
            nextSetNum={currentSet}
            totalSets={totalSets}
            exerciseName={currentExercise?.name || ''}
            onExtend={handleExtendRest}
            onSkip={handleSkipRestWithFallback}
          />
        </View>
      )}

      {/* Workout Complete Overlay */}
      <Modal visible={showComplete} animationType="fade" transparent>
        <View style={styles.completeOverlay}>
          <View style={styles.completeCard}>
            <MaterialIcons name="emoji-events" size={48} color={colors.primary} />
            <Text style={styles.completeTitle}>WORKOUT COMPLETE</Text>

            {completeStats && (
              <View style={styles.completeStatsGrid}>
                <View style={styles.completeStat}>
                  <Text style={styles.completeStatValue}>{completeStats.exercises_done}</Text>
                  <Text style={styles.completeStatLabel}>Exercises</Text>
                </View>
                <View style={styles.completeStat}>
                  <Text style={styles.completeStatValue}>{completeStats.total_sets}</Text>
                  <Text style={styles.completeStatLabel}>Sets</Text>
                </View>
                <View style={styles.completeStat}>
                  <Text style={styles.completeStatValue}>
                    {completeStats.total_volume >= 1000
                      ? `${(completeStats.total_volume / 1000).toFixed(1)}k`
                      : Math.round(completeStats.total_volume || 0)}
                  </Text>
                  <Text style={styles.completeStatLabel}>Volume (kg)</Text>
                </View>
                <View style={styles.completeStat}>
                  <Text style={styles.completeStatValue}>
                    {completeStats.duration_seconds >= 3600
                      ? `${Math.floor(completeStats.duration_seconds / 3600)}h${Math.floor((completeStats.duration_seconds % 3600) / 60)}m`
                      : `${Math.round(completeStats.duration_seconds / 60)}m`}
                  </Text>
                  <Text style={styles.completeStatLabel}>Duration</Text>
                </View>
              </View>
            )}

            <View style={styles.completeCoachBubble}>
              {completeMessage ? (
                <Text style={styles.completeCoachText}>{completeMessage}</Text>
              ) : (
                <View style={styles.aiLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.aiLoadingText}>Aura is cheering you on...</Text>
                </View>
              )}
            </View>

            {shareImage?.image ? (
              <View style={styles.shareImageContainer}>
                <Image source={{ uri: shareImage.image }} style={styles.shareImage} resizeMode="contain" />
                <TouchableOpacity
                  style={styles.shareActionButton}
                  onPress={() => Share.share({ message: shareImage.caption || 'Crushed my workout with Aura!' })}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="share" size={18} color={colors.bgDark} />
                  <Text style={styles.shareActionText}>Share</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.shareButton} onPress={handleShareWorkout} disabled={isShareLoading} activeOpacity={0.7}>
                {isShareLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <MaterialIcons name="share" size={18} color={colors.primary} />
                    <Text style={styles.shareButtonText}>Share Workout</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.completeFinishButton} onPress={() => router.back()} activeOpacity={0.85}>
              <Text style={styles.completeFinishText}>FINISH</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Exercise Detail Modal */}
      <ExerciseDetail
        exercise={libraryExercise}
        visible={showExerciseDetail}
        onClose={() => setShowExerciseDetail(false)}
      />

      {/* Exercise Hub (between-exercise transition) */}
      <ExerciseHub
        visible={showExerciseHub}
        exercises={exercises}
        completedExercises={completedExercises}
        exerciseSets={exerciseSets}
        suggestedNextIdx={suggestedNextIdx}
        onSelectExercise={handleExerciseHubSelect}
      />

      {/* Begin Set / Exercise Complete / Workout Complete Modal */}
      <TransitionModal
        visible={alarmFired}
        variant={transitionVariant}
        title={currentExercise?.name || ''}
        subtitle={`SET ${currentSet} OF ${totalSets}`}
        onPrimaryAction={handleBeginSet}
        secondaryLabel="+15 SECONDS"
        onSecondaryAction={handleExtendRest}
      />
    </SafeAreaView>
  );
}

const RPE_DESCRIPTIONS = {
  0: 'Nothing at all',
  1: 'Very Light',
  2: 'Light',
  3: 'Moderate',
  4: 'Somewhat Hard',
  5: 'Hard',
  6: 'Harder',
  7: 'Very Hard: Heavy breathing, hard to maintain form',
  8: 'Very Hard+: Could do 2 more reps',
  9: 'Near Max: Could do 1 more rep',
  10: 'Maximum Effort: Nothing left',
};

function RpeSelector({ rpe, setRpe }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const displayRpe = rpe ?? 5;

  return (
    <View style={styles.rpeCard}>
      <View style={styles.rpeHeader}>
        <View>
          <Text style={styles.rpeTitle}>HOW HARD WAS THAT? (RPE)</Text>
          <TouchableOpacity style={styles.rpeHelpButton} onPress={() => setShowTooltip(!showTooltip)} activeOpacity={0.7}>
            <MaterialIcons name="help-outline" size={12} color="rgba(212,255,0,0.4)" />
            <Text style={styles.rpeHelpText}>What is this?</Text>
          </TouchableOpacity>
          {showTooltip && (
            <View style={styles.rpeTooltip}>
              <Text style={styles.rpeTooltipText}>
                Rating of Perceived Exertion (0-10) measures how intense the set felt.
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.rpeSelectedValue}>{displayRpe}</Text>
      </View>

      <View style={styles.rpeSliderContainer}>
        <Slider
          style={styles.rpeSlider}
          minimumValue={0}
          maximumValue={10}
          step={1}
          value={displayRpe}
          onValueChange={(val) => setRpe(Math.round(val))}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor="rgba(212,255,0,0.2)"
          thumbTintColor={colors.primary}
        />
        <View style={styles.rpeSliderLabels}>
          <Text style={styles.rpeSliderLabel}>0</Text>
          <Text style={styles.rpeSliderLabel}>5</Text>
          <Text style={styles.rpeSliderLabel}>10</Text>
        </View>
      </View>

      {rpe !== null && (
        <Text style={styles.rpeDescription}>
          <Text style={styles.rpeDescriptionBold}>{rpe} - {RPE_DESCRIPTIONS[rpe]?.split(':')[0]}:</Text>
          {RPE_DESCRIPTIONS[rpe]?.includes(':') ? RPE_DESCRIPTIONS[rpe].split(':').slice(1).join(':') : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarker },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(212,255,0,0.1)',
  },
  headerSide: { width: 48, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.textPrimary },
  headerSub: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.primary, textTransform: 'uppercase', letterSpacing: 2, marginTop: 2 },
  headerKicker: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary },
  headerKickerAccent: { color: colors.primary, fontFamily: 'Inter_800ExtraBold' },
  headerKickerFaint: { color: colors.textSecondary, opacity: 0.6 },
  headerKickerDot: { color: colors.textSecondary, opacity: 0.4 },
  headerKickerFocus: { fontSize: 10, fontFamily: 'Inter_800ExtraBold', color: colors.textMuted, letterSpacing: 1 },
  settingsButton: {
    width: 40, height: 40, borderRadius: radius.sm,
    backgroundColor: 'rgba(212,255,0,0.1)', justifyContent: 'center', alignItems: 'center',
  },

  // Celebration banner
  celebrationBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.md, marginTop: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.lg, backgroundColor: colors.primary,
  },
  celebrationText: {
    flex: 1, fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.bgDark,
  },

  // Progress
  progressSection: { paddingHorizontal: spacing.md, paddingTop: 6, paddingBottom: 16 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  progressLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1.5 },
  progressPercent: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.primary, letterSpacing: 1.5 },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.primary },

  // Exercise strip
  exerciseStrip: { maxHeight: 40, flexGrow: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(212,255,0,0.08)' },
  exerciseStripContent: { paddingHorizontal: spacing.md, gap: spacing.xs, alignItems: 'center' },
  exercisePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: 'rgba(212,255,0,0.06)',
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.08)',
  },
  exercisePillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  exercisePillDone: { backgroundColor: 'rgba(212,255,0,0.1)', borderColor: 'rgba(212,255,0,0.2)' },
  exercisePillPartial: { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.25)' },
  exercisePillText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.textMuted, maxWidth: 120 },
  exercisePillTextActive: { color: colors.bgDark, fontFamily: 'Inter_700Bold' },
  exercisePillTextDone: { color: colors.primary },
  exercisePillTextPartial: { color: 'rgb(251,191,36)' },

  // Main content
  mainScroll: { flex: 1 },
  mainContent: { paddingHorizontal: spacing.md, paddingTop: 0, paddingBottom: 220, gap: spacing.md },

  // Coach tip
  coachTip: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 14,
    backgroundColor: colors.primaryGhost,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 14,
  },
  coachTipText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: colors.textPrimary,
    lineHeight: 19,
  },

  // Up Next
  upNext: { gap: 6 },
  upNextLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
    marginLeft: 2,
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
  },
  upNextNum: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: colors.bgCardSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upNextNumText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: colors.textSecondary,
  },
  upNextName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: colors.textPrimary,
  },
  upNextMeta: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textSecondary,
  },

  // Floating rest overlay
  restOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: spacing.md,
  },

  // Target
  targetSection: { alignItems: 'center', gap: spacing.sm },
  targetLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 3 },
  targetValues: { flexDirection: 'row', alignItems: 'baseline' },
  targetNumber: { fontSize: 48, fontFamily: 'Inter_800ExtraBold', color: colors.textPrimary },
  targetUnit: { fontSize: 22, fontFamily: 'Inter_700Bold', color: colors.primary },
  targetX: { fontSize: 28, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.3)', marginHorizontal: spacing.sm },
  formGuideButton: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.3)', backgroundColor: 'rgba(212,255,0,0.05)',
    marginTop: spacing.sm,
  },
  formGuideText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.primary },

  // Adjusters
  adjustCard: {
    width: '100%', maxWidth: 340, padding: spacing.lg,
    borderRadius: radius.xl, backgroundColor: 'rgba(28,31,13,0.5)',
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.05)', gap: spacing.md,
  },
  adjusterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  adjusterLabel: { fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.textSecondary },
  adjusterControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 0 },
  adjusterButton: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: 'rgba(212,255,0,0.1)', borderWidth: 1, borderColor: 'rgba(212,255,0,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  adjusterValue: { fontSize: 24, fontFamily: 'Inter_700Bold', color: colors.textPrimary, width: 72, textAlign: 'center' },
  adjusterValueContainer: { alignItems: 'center', width: 72 },
  adjusterValueInput: {
    fontSize: 24, fontFamily: 'Inter_700Bold', color: colors.textPrimary,
    width: 72, textAlign: 'center', padding: 0,
    borderBottomWidth: 2, borderBottomColor: colors.primary,
  },
  unitToggle: {
    backgroundColor: 'rgba(212,255,0,0.15)', borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.25)',
  },
  unitToggleText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.primary },
  unitIncrementRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  incrementLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', color: colors.textSecondary },
  divider: { height: 1, backgroundColor: 'rgba(212,255,0,0.1)' },

  // Done button
  doneButton: {
    width: '100%', maxWidth: 340, paddingVertical: 22, borderRadius: radius.lg,
    backgroundColor: colors.primary, alignItems: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.2, shadowOffset: { width: 0, height: 10 }, shadowRadius: 30,
  },
  doneButtonText: { fontSize: 24, fontFamily: 'Inter_800ExtraBold', color: colors.bgDark, letterSpacing: -0.5 },
  doneButtonSub: { fontSize: 10, fontFamily: 'Inter_700Bold', color: 'rgba(18,20,8,0.6)', letterSpacing: 2, marginTop: 2 },

  // Rest state
  restContainer: { alignItems: 'center', gap: spacing.lg },
  restLabel: { fontSize: 14, fontFamily: 'Inter_800ExtraBold', color: colors.primary, letterSpacing: 4 },
  restTimer: { fontSize: 72, fontFamily: 'Inter_800ExtraBold', color: colors.primary },
  skipRestButton: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.3)',
  },
  skipRestText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.primary, letterSpacing: 2 },

  // Coaching zone
  voiceBar: {
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.lg,
    borderTopWidth: 1.5, borderTopColor: 'rgba(212,255,0,0.2)',
    backgroundColor: 'rgba(18,20,8,0.95)',
  },
  voiceBarInner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: 'rgba(212,255,0,0.06)', borderRadius: radius.full,
    paddingLeft: spacing.md, paddingRight: 6, paddingVertical: 6,
    borderWidth: 1.5, borderColor: 'rgba(212,255,0,0.25)',
  },
  micButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  chatInput: {
    flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(212,255,0,0.1)',
  },
  sendButtonActive: { backgroundColor: colors.primary },
  aiResponseContainer: {
    backgroundColor: 'rgba(212,255,0,0.08)', borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.2)',
    padding: spacing.md, marginBottom: spacing.sm,
  },
  aiResponseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  aiResponseAvatar: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  aiResponseLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.primary, letterSpacing: 1.5 },
  aiResponseText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textPrimary, lineHeight: 21 },
  aiLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  aiLoadingText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, fontStyle: 'italic' },

  // Rest preview (inline in progress bar)
  restPreviewInline: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(212,255,0,0.08)', borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.1)',
  },
  restPreviewInlineText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary },

  // Push suggestion banner
  pushBanner: {
    width: '100%', maxWidth: 340, flexDirection: 'row', alignItems: 'flex-start',
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    gap: spacing.sm,
  },
  pushBannerIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgb(34,197,94)',
    justifyContent: 'center', alignItems: 'center', marginTop: 2,
  },
  pushBannerContent: { flex: 1 },
  pushBannerTitle: { fontSize: 10, fontFamily: 'Inter_800ExtraBold', color: 'rgb(34,197,94)', letterSpacing: 2, marginBottom: 4 },
  pushBannerText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: 'rgba(34,197,94,0.85)', lineHeight: 18 },

  // Estimated weight banner
  estimateBanner: {
    width: '100%', maxWidth: 340, flexDirection: 'row', alignItems: 'flex-start',
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: 'rgba(251,191,36,0.08)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)',
    gap: spacing.sm,
  },
  estimateBannerIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgb(251,191,36)',
    justifyContent: 'center', alignItems: 'center', marginTop: 2,
  },
  estimateBannerContent: { flex: 1 },
  estimateBannerTitle: { fontSize: 10, fontFamily: 'Inter_800ExtraBold', color: 'rgb(251,191,36)', letterSpacing: 2, marginBottom: 4 },
  estimateBannerText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: 'rgba(251,191,36,0.85)', lineHeight: 18 },

  // Completion overlay
  completeOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  completeCard: {
    width: '100%', maxWidth: 360, alignItems: 'center',
    backgroundColor: colors.bgDarker, borderRadius: radius.xl,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.15)',
    padding: spacing.xl, gap: spacing.lg,
  },
  completeTitle: { fontSize: 22, fontFamily: 'Inter_800ExtraBold', color: colors.primary, letterSpacing: 3 },
  completeStatsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: spacing.md, width: '100%',
  },
  completeStat: {
    alignItems: 'center', minWidth: 80, padding: spacing.sm,
    backgroundColor: 'rgba(212,255,0,0.05)', borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.08)', flex: 1,
  },
  completeStatValue: { fontSize: 24, fontFamily: 'Inter_800ExtraBold', color: colors.textPrimary },
  completeStatLabel: {
    fontSize: 10, fontFamily: 'Inter_500Medium', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: 2,
  },
  completeCoachBubble: {
    width: '100%', backgroundColor: 'rgba(212,255,0,0.08)',
    borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(212,255,0,0.15)',
    padding: spacing.md,
  },
  completeCoachText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textPrimary, lineHeight: 21, textAlign: 'center' },
  completeFinishButton: {
    width: '100%', paddingVertical: 18, borderRadius: radius.lg,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  completeFinishText: { fontSize: 18, fontFamily: 'Inter_800ExtraBold', color: colors.bgDark, letterSpacing: 2 },

  // Weight badge
  weightBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  weightBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },

  // RPE selector
  rpeCard: {
    width: '100%', maxWidth: 340, padding: spacing.lg,
    borderRadius: 24, backgroundColor: 'rgba(28,31,13,0.3)',
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.05)', gap: spacing.sm,
  },
  rpeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rpeTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textPrimary, textTransform: 'uppercase', letterSpacing: 1.5 },
  rpeSelectedValue: { fontSize: 24, fontFamily: 'Inter_800ExtraBold', color: colors.primary },
  rpeHelpButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  rpeHelpText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: 'rgba(212,255,0,0.4)' },
  rpeTooltip: {
    position: 'absolute', top: 36, left: 0, zIndex: 10,
    backgroundColor: '#1c1f0d', borderWidth: 1, borderColor: 'rgba(212,255,0,0.2)',
    padding: spacing.sm, borderRadius: radius.sm, width: 200,
  },
  rpeTooltipText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textSecondary },
  rpeSliderContainer: { width: '100%', paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
  rpeSlider: { width: '100%', height: 40 },
  rpeSliderLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4 },
  rpeSliderLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textSecondary },
  rpeDescription: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(212,255,0,0.8)' },
  rpeDescriptionBold: { fontFamily: 'Inter_700Bold' },

  // Exercise demo image
  exerciseImageContainer: {
    width: '100%', maxWidth: 340, borderRadius: radius.lg,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  exerciseImage: { width: '100%', height: 280, backgroundColor: colors.bgDarker },
  exerciseImageCaption: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, padding: spacing.md, lineHeight: 19 },

  // Share workout
  shareButton: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: 14, borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.3)', backgroundColor: 'rgba(212,255,0,0.05)',
  },
  shareButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.primary },
  shareImageContainer: { width: '100%', alignItems: 'center', gap: spacing.sm },
  shareImage: { width: '100%', height: 320, borderRadius: radius.md },
  shareActionButton: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.primary,
  },
  shareActionText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.bgDark },
});
