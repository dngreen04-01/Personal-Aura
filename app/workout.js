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
      if (currentExIdx < exercises.length - 1) {
        afterRestCallback = () => setShowExerciseHub(true);
      } else {
        const sid = sessionId;
        afterRestCallback = async () => {
          if (sid) await endSession(sid);
          const stats = sid ? await getSessionStats(sid) : null;
          setCompleteStats(stats);
          setShowComplete(true);

          const completeCtx = buildUserContext({
            profile: userProfile,
            completion: stats,
            location,
            motivation: { exerciseMaxWeight, streakData, completedSessions },
          });
          sendAgentMessage('__workout_complete__', [], completeCtx)
            .then(data => setCompleteMessage(data.text))
            .catch(() => setCompleteMessage('Great work today — you crushed it!'));
        };
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
    if (currentSet >= totalSets && currentExIdx >= exercises.length - 1) return 'workout_complete';
    if (currentSet >= totalSets) return 'exercise_complete';
    return 'begin_set';
  })();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerSide} onPress={handleClose}>
          <MaterialIcons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.headerTitle}>{isStrengthBlock ? currentExercise?.name : (currentBlock?.label || currentBlock?.block_type)}</Text>
            {isStrengthBlock && libraryExercise && (
              <TouchableOpacity onPress={() => setShowExerciseDetail(true)} hitSlop={8}>
                <MaterialIcons name="info-outline" size={18} color={colors.primaryDim} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.headerSub}>
            {isStrengthBlock
              ? `SET ${currentSet} OF ${totalSets}${location?.name ? ` \u00B7 ${location.name}` : ''}`
              : `${currentBlock?.block_type?.toUpperCase() || ''}${location?.name ? ` \u00B7 ${location.name}` : ''}`}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerSide}>
          <View style={styles.settingsButton}>
            <MaterialIcons name="settings" size={20} color={colors.primary} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Celebration Banner */}
      {celebration && (
        <View style={styles.celebrationBanner}>
          <MaterialIcons name="emoji-events" size={20} color={colors.bgDark} />
          <Text style={styles.celebrationText}>{celebration.message}</Text>
        </View>
      )}

      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabel}>PROGRESS</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {!isResting && (
              <View style={styles.restPreviewInline}>
                <MaterialIcons name="timer" size={14} color={colors.textSecondary} />
                <Text style={styles.restPreviewInlineText}>{formatTime(restDuration)}</Text>
              </View>
            )}
            <Text style={styles.progressPercent}>{progressPercent}%</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {/* Exercise / Block List */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.exerciseStrip}
        contentContainerStyle={styles.exerciseStripContent}
      >
        {(exercises.length > 0 ? exercises : sessionBlocks).map((item, i) => {
          const isCurrent = i === currentExIdx;
          const isDone = completedExercises.has(i);
          const isPartial = !isDone && (exerciseSets[i] || 0) > 0;
          const pillLabel = item.name || item.label || item.block_type || `Block ${i + 1}`;
          return (
            <TouchableOpacity
              key={`${pillLabel}-${i}`}
              style={[
                styles.exercisePill,
                isCurrent && styles.exercisePillActive,
                isDone && styles.exercisePillDone,
                isPartial && styles.exercisePillPartial,
              ]}
              onPress={() => {
                setCurrentExIdx(i);
                setCurrentSet(1);
              }}
              activeOpacity={0.7}
            >
              {isDone && <MaterialIcons name="check-circle" size={14} color={colors.primary} />}
              {isPartial && <MaterialIcons name="radio-button-checked" size={14} color="rgb(251,191,36)" />}
              <Text
                style={[
                  styles.exercisePillText,
                  isCurrent && styles.exercisePillTextActive,
                  isDone && styles.exercisePillTextDone,
                  isPartial && styles.exercisePillTextPartial,
                ]}
                numberOfLines={1}
              >
                {pillLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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
              if (currentExIdx < (exercises.length || sessionBlocks.length) - 1) {
                setShowExerciseHub(true);
              } else {
                (async () => {
                  if (sessionId) await endSession(sessionId);
                  const stats = sessionId ? await getSessionStats(sessionId) : null;
                  setCompleteStats(stats);
                  setShowComplete(true);
                })();
              }
            }}
          />
        </View>
      ) : (
      <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}>
        {isResting ? (
          <View style={styles.restContainer}>
            <Text style={styles.restLabel}>REST</Text>
            <Text style={styles.restTimer}>{formatTime(restRemaining)}</Text>
            <TouchableOpacity style={styles.skipRestButton} onPress={handleSkipRestWithFallback}>
              <Text style={styles.skipRestText}>SKIP REST</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Push Suggestion Banner */}
            {pushSuggestion && (
              <View style={styles.pushBanner}>
                <View style={styles.pushBannerIcon}>
                  <MaterialIcons name="trending-up" size={16} color={colors.bgDark} />
                </View>
                <View style={styles.pushBannerContent}>
                  <Text style={styles.pushBannerTitle}>PUSH RECOMMENDATION</Text>
                  <Text style={styles.pushBannerText}>{pushSuggestion}</Text>
                </View>
                <TouchableOpacity onPress={() => setPushSuggestion(null)} hitSlop={8}>
                  <MaterialIcons name="close" size={16} color="rgba(212,255,0,0.4)" />
                </TouchableOpacity>
              </View>
            )}

            {/* Estimated Weight Banner */}
            {isEstimatedWeight && (
              <View style={styles.estimateBanner}>
                <View style={styles.estimateBannerIcon}>
                  <MaterialIcons name="auto-awesome" size={16} color={colors.bgDark} />
                </View>
                <View style={styles.estimateBannerContent}>
                  <Text style={styles.estimateBannerTitle}>ESTIMATED WEIGHT</Text>
                  <Text style={styles.estimateBannerText}>
                    Based on your strength profile. Adjust as needed.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setIsEstimatedWeight(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={16} color="rgba(251,191,36,0.4)" />
                </TouchableOpacity>
              </View>
            )}

            {/* Target Goal */}
            <View style={styles.targetSection}>
              <Text style={styles.targetLabel}>TARGET GOAL</Text>
              <View style={styles.targetValues}>
                <Text style={styles.targetNumber}>{lastLoggedWeight != null ? lastLoggedWeight : weight}<Text style={styles.targetUnit}>{weightUnit}</Text></Text>
                <Text style={styles.targetX}> × </Text>
                <Text style={styles.targetNumber}>{targetReps}<Text style={styles.targetUnit}>Reps</Text></Text>
              </View>
              <TouchableOpacity style={styles.formGuideButton} onPress={handleShowMe} activeOpacity={0.7}>
                {isImageLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialIcons name={exerciseImage ? 'visibility-off' : 'visibility'} size={16} color={colors.primary} />
                )}
                <Text style={styles.formGuideText}>{exerciseImage ? 'Hide Demo' : 'Show Me'}</Text>
              </TouchableOpacity>
            </View>

            {/* Exercise Demo Image */}
            {exerciseImage && (
              <View style={styles.exerciseImageContainer}>
                {exerciseImage.image && (
                  <Image source={{ uri: exerciseImage.image }} style={styles.exerciseImage} resizeMode="contain" />
                )}
                {exerciseImage.caption ? (
                  <Text style={styles.exerciseImageCaption}>{exerciseImage.caption}</Text>
                ) : null}
              </View>
            )}

            {/* Adjusters */}
            <View style={styles.adjustCard}>
              {/* Weight adjuster */}
              <View style={styles.adjusterRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 }}>
                  <Text style={styles.adjusterLabel} numberOfLines={1}>Weight</Text>
                  {weightBadge && (
                    <View style={[styles.weightBadge, { backgroundColor: weightBadge.startsWith('+') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                      <Text style={[styles.weightBadgeText, { color: weightBadge.startsWith('+') ? 'rgb(34,197,94)' : 'rgb(239,68,68)' }]}>{weightBadge}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.adjusterControls}>
                  <TouchableOpacity style={styles.adjusterButton} onPress={() => setWeight(w => Math.max(0, w - weightIncrement))}>
                    <MaterialIcons name="remove" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <View style={styles.adjusterValueContainer}>
                    {isEditingWeight ? (
                      <TextInput
                        style={styles.adjusterValueInput}
                        value={weightInputText}
                        onChangeText={setWeightInputText}
                        keyboardType="decimal-pad"
                        autoFocus
                        selectTextOnFocus
                        onSubmitEditing={() => {
                          const parsed = parseFloat(weightInputText);
                          if (!isNaN(parsed) && parsed >= 0) setWeight(snapToIncrement(parsed, weightUnit, currentExercise.name));
                          setIsEditingWeight(false);
                        }}
                        onBlur={() => {
                          const parsed = parseFloat(weightInputText);
                          if (!isNaN(parsed) && parsed >= 0) setWeight(snapToIncrement(parsed, weightUnit, currentExercise.name));
                          setIsEditingWeight(false);
                        }}
                      />
                    ) : (
                      <TouchableOpacity onPress={() => { setWeightInputText(formatWeight(weight, weightUnit)); setIsEditingWeight(true); }}>
                        <Text style={styles.adjusterValue} numberOfLines={1}>{formatWeight(weight, weightUnit)}</Text>
                      </TouchableOpacity>
                    )}
                    <View style={styles.unitIncrementRow}>
                      <TouchableOpacity
                        style={styles.unitToggle}
                        onPress={() => {
                          const newUnit = weightUnit === 'kg' ? 'lbs' : 'kg';
                          const converted = snapToIncrement(convertWeight(weight, weightUnit, newUnit), newUnit, currentExercise.name);
                          setWeight(converted);
                          setWeightUnit(newUnit);
                          setWeightIncrement(getDefaultIncrement(newUnit, currentExercise.name));
                          setExerciseUnitPreference(currentExercise.name, newUnit);
                        }}
                      >
                        <Text style={styles.unitToggleText}>{weightUnit.toUpperCase()}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => {
                        const increments = getIncrements(weightUnit);
                        const idx = increments.indexOf(weightIncrement);
                        setWeightIncrement(increments[(idx + 1) % increments.length]);
                      }}>
                        <Text style={styles.incrementLabel}>±{weightIncrement}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.adjusterButton} onPress={() => setWeight(w => w + weightIncrement)}>
                    <MaterialIcons name="add" size={22} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Reps adjuster */}
              <View style={styles.adjusterRow}>
                <Text style={styles.adjusterLabel}>Reps</Text>
                <View style={styles.adjusterControls}>
                  <TouchableOpacity style={styles.adjusterButton} onPress={() => setReps(r => Math.max(1, r - 1))}>
                    <MaterialIcons name="remove" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.adjusterValue}>{reps}</Text>
                  <TouchableOpacity style={styles.adjusterButton} onPress={() => setReps(r => r + 1)}>
                    <MaterialIcons name="add" size={22} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* RPE Selector */}
            <RpeSelector rpe={rpe} setRpe={setRpe} />

            {/* Done Button */}
            <TouchableOpacity style={styles.doneButton} onPress={handleDone} activeOpacity={0.85}>
              <Text style={styles.doneButtonText}>DONE</Text>
              <Text style={styles.doneButtonSub}>LOGS SET & STARTS {restDuration}S REST</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      )}

      {/* Bottom Voice Bar */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={styles.voiceBar}>
          {(aiResponse || isAiLoading) && (
            <View style={styles.aiResponseContainer}>
              <View style={styles.aiResponseHeader}>
                <View style={styles.aiResponseAvatar}>
                  <MaterialIcons name="bolt" size={12} color={colors.bgDark} />
                </View>
                <Text style={styles.aiResponseLabel}>AURA</Text>
              </View>
              {isAiLoading ? (
                <View style={styles.aiLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.aiLoadingText}>Thinking...</Text>
                </View>
              ) : (
                <Text style={styles.aiResponseText}>{aiResponse.text}</Text>
              )}
            </View>
          )}

          <View style={styles.voiceBarInner}>
            <TextInput
              ref={inputRef}
              style={styles.chatInput}
              placeholder="Ask your coach..."
              placeholderTextColor="rgba(212,255,0,0.35)"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.micButton}>
              <MaterialIcons name="mic" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSend}
              disabled={isAiLoading || !inputText.trim()}
              style={[styles.sendButton, inputText.trim() && styles.sendButtonActive]}
            >
              {isAiLoading ? (
                <ActivityIndicator size="small" color={colors.bgDark} />
              ) : (
                <MaterialIcons name="send" size={18} color={inputText.trim() ? colors.bgDark : 'rgba(212,255,0,0.3)'} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

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
  progressSection: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  progressLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1.5 },
  progressPercent: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.primary, letterSpacing: 1.5 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(212,255,0,0.1)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },

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
  mainContent: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 140, gap: spacing.md },

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
