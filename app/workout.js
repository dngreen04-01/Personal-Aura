import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, AppState,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
  Image, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../lib/theme';
import { startSession, endSession, logSet as dbLogSet, getSessionStats, getExerciseProgressionData, getExerciseMaxWeight, getWorkoutStreak, getCompletedSessionCount, getUserProfile, getExerciseUnitPreference, setExerciseUnitPreference } from '../lib/database';
import { sendAgentMessage, generateExerciseImage, generateWorkoutCard } from '../lib/api';
import { buildUserContext } from '../lib/contextBuilder';
import { convertWeight, formatWeight, formatWeightBadge, getIncrements, getDefaultIncrement, snapToIncrement } from '../lib/weightUtils';
import { evaluateSet, checkMilestone } from '../lib/motivation';

// Lazy-load expo-notifications (not available in Expo Go SDK 53+)
let Notifications = null;
try {
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {}

export default function WorkoutScreen() {
  const router = useRouter();
  const { dayJson, startIdx, locationJson } = useLocalSearchParams();
  const day = dayJson ? JSON.parse(dayJson) : null;
  const location = locationJson ? JSON.parse(locationJson) : null;

  const [sessionId, setSessionId] = useState(null);
  const [currentExIdx, setCurrentExIdx] = useState(parseInt(startIdx) || 0);
  const [currentSet, setCurrentSet] = useState(1);
  const [isResting, setIsResting] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const restEndTimeRef = useRef(null);
  const pendingAdvanceRef = useRef(null);
  const restNotifIdRef = useRef(null);
  const [rpe, setRpe] = useState(null);
  const [weightBadge, setWeightBadge] = useState(null);

  const exercises = day?.exercises || [];
  const currentExercise = exercises[currentExIdx];
  const totalSets = parseInt(currentExercise?.sets) || 4;
  const targetReps = parseInt(currentExercise?.reps) || 8;
  const targetWeight = parseFloat(currentExercise?.targetWeight) || 0;
  const restDuration = parseInt(currentExercise?.restSeconds) || 90;

  const [weight, setWeight] = useState(targetWeight);
  const [lastLoggedWeight, setLastLoggedWeight] = useState(null);
  const [reps, setReps] = useState(targetReps);
  const [pushSuggestion, setPushSuggestion] = useState(null);
  const [inputText, setInputText] = useState('');
  const [isInputMode, setIsInputMode] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [weightUnit, setWeightUnit] = useState('kg');
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [weightInputText, setWeightInputText] = useState('');
  const [weightIncrement, setWeightIncrement] = useState(2.5);
  const [showComplete, setShowComplete] = useState(false);
  const [completeStats, setCompleteStats] = useState(null);
  const [completeMessage, setCompleteMessage] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [exerciseMaxWeight, setExerciseMaxWeight] = useState(null);
  const [streakData, setStreakData] = useState(null);
  const [completedSessions, setCompletedSessions] = useState(null);
  const [exerciseImage, setExerciseImage] = useState(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [shareImage, setShareImage] = useState(null);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const inputRef = useRef(null);
  const weightInputRef = useRef(null);

  // Reset weight/reps/rpe when exercise changes, apply progressive overload
  useEffect(() => {
    if (currentExercise) {
      const planWeightKg = parseFloat(currentExercise.targetWeight) || 0;
      setReps(parseInt(currentExercise.reps) || 8);
      setRpe(null);
      setWeightBadge(null);
      setPushSuggestion(null);
      setLastLoggedWeight(null);
      setIsEditingWeight(false);
      setExerciseImage(null);

      (async () => {
        try {
          // Load per-exercise unit preference
          const unit = await getExerciseUnitPreference(currentExercise.name);
          setWeightUnit(unit);
          setWeightIncrement(getDefaultIncrement(unit));

          // Load milestone data for motivation engine
          const [maxW, streak, sessions] = await Promise.all([
            getExerciseMaxWeight(currentExercise.name),
            getWorkoutStreak(),
            getCompletedSessionCount(),
          ]);
          setExerciseMaxWeight(maxW);
          setStreakData(streak);
          setCompletedSessions(sessions);

          const progression = await getExerciseProgressionData(currentExercise.name, 4, unit);
          // Plan target is always in kg — convert to display unit
          const planWeightDisplay = unit === 'lbs' ? Math.round(planWeightKg * 2.20462) : planWeightKg;

          if (progression.suggestedWeight && progression.suggestedWeight !== planWeightDisplay) {
            setWeight(progression.suggestedWeight);
            const diff = progression.suggestedWeight - planWeightDisplay;
            if (diff > 0) {
              setWeightBadge(formatWeightBadge(diff, unit));
            } else if (planWeightDisplay > 0) {
              setWeightBadge(`${Math.round(((progression.suggestedWeight / planWeightDisplay) - 1) * 100)}%`);
            }
            if (progression.pushReason && progression.suggestedWeight > planWeightDisplay) {
              setPushSuggestion(progression.pushReason);
            }
          } else {
            setWeight(planWeightDisplay);
          }
        } catch {
          const planWeightDisplay = weightUnit === 'lbs' ? Math.round(planWeightKg * 2.20462) : planWeightKg;
          setWeight(planWeightDisplay);
        }
      })();
    }
  }, [currentExIdx]);

  // Start session & request notification permissions
  useEffect(() => {
    const init = async () => {
      if (day) {
        const id = await startSession(day.day, day.focus, location?.id || null);
        setSessionId(id);
      }
      if (Notifications) await Notifications.requestPermissionsAsync();
      try {
        const profile = await getUserProfile();
        setUserProfile(profile);
      } catch {}
    };
    init();
  }, []);

  // Schedule a local notification for when rest ends
  const scheduleRestNotification = async (seconds) => {
    if (!Notifications) return;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Rest Complete',
          body: 'Time to hit your next set!',
          sound: true,
        },
        trigger: { type: 'timeInterval', seconds, repeats: false },
      });
      restNotifIdRef.current = id;
    } catch {}
  };

  const cancelRestNotification = async () => {
    if (restNotifIdRef.current && Notifications) {
      try {
        await Notifications.cancelScheduledNotificationAsync(restNotifIdRef.current);
      } catch {}
      restNotifIdRef.current = null;
    }
  };

  // Advance to next set/exercise when rest completes
  const completeRest = useCallback(() => {
    setIsResting(false);
    setRestRemaining(0);
    restEndTimeRef.current = null;
    cancelRestNotification();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const advance = pendingAdvanceRef.current;
    pendingAdvanceRef.current = null;
    if (advance) advance();
  }, []);

  // Rest timer - uses end timestamp so it survives backgrounding
  useEffect(() => {
    if (!isResting || !restEndTimeRef.current) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((restEndTimeRef.current - Date.now()) / 1000));
      if (remaining <= 0) {
        completeRest();
      } else {
        setRestRemaining(remaining);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [isResting, completeRest]);

  // Recalculate rest timer when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && restEndTimeRef.current) {
        const remaining = Math.max(0, Math.ceil((restEndTimeRef.current - Date.now()) / 1000));
        if (remaining <= 0) {
          completeRest();
        } else {
          setRestRemaining(remaining);
          setIsResting(true);
        }
      }
    });
    return () => sub.remove();
  }, [completeRest]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Calculate total sets completed across all exercises up to current
  const completedSets = exercises.slice(0, currentExIdx).reduce((sum, e) => sum + (parseInt(e.sets) || 3), 0) + (currentSet - 1);
  const grandTotalSets = exercises.reduce((sum, e) => sum + (parseInt(e.sets) || 3), 0);
  const progressPercent = grandTotalSets > 0 ? Math.round((completedSets / grandTotalSets) * 100) : 0;

  const handleShowMe = async () => {
    if (exerciseImage) {
      setExerciseImage(null);
      return;
    }
    setIsImageLoading(true);
    try {
      const result = await generateExerciseImage(
        currentExercise.name,
        userProfile?.equipment || null,
      );
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
    // Log to DB
    if (sessionId && currentExercise) {
      await dbLogSet(sessionId, currentExercise.name, currentSet, weight, weightUnit, reps, rpe, restDuration);
    }
    setLastLoggedWeight(weight);

    // Motivation Engine: evaluate set and provide structured coaching feedback
    if (rpe !== null) {
      const evaluation = evaluateSet({
        rpe,
        goal: userProfile?.goal,
        currentWeight: weight,
        weightUnit,
        exerciseName: currentExercise.name,
      });

      // Check for milestones
      const milestone = checkMilestone({
        currentWeight: weight,
        exerciseMaxWeight,
        streakData,
        completedSessions,
      });

      // Show coaching message
      setAiResponse({ text: evaluation.messageHint });

      // Show celebration banner on milestone
      if (milestone) {
        setCelebration(milestone);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setCelebration(null), 3000);
      }

      // Auto-bump weight for next set if push tone with weight adjustment
      if (evaluation.tone === 'push' && evaluation.weightAdjustment && currentSet < totalSets) {
        const adjKg = evaluation.weightAdjustment.value;
        const increment = weightUnit === 'lbs' ? Math.round(adjKg * 2.20462) : adjKg;
        setWeight(w => w + increment);
      }
    }

    // Start rest with absolute end timestamp
    restEndTimeRef.current = Date.now() + restDuration * 1000;
    setIsResting(true);
    setRestRemaining(restDuration);
    scheduleRestNotification(restDuration);

    // Queue what happens after rest completes
    if (currentSet >= totalSets) {
      if (currentExIdx < exercises.length - 1) {
        pendingAdvanceRef.current = () => {
          setCurrentExIdx(prev => prev + 1);
          setCurrentSet(1);
        };
      } else {
        const sid = sessionId;
        pendingAdvanceRef.current = async () => {
          if (sid) await endSession(sid);
          const stats = sid ? await getSessionStats(sid) : null;
          setCompleteStats(stats);
          setShowComplete(true);
          // Fire off agent celebration message in background (fallback to coach)
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
      pendingAdvanceRef.current = null;
    }
  };

  const handleSkipRest = () => {
    restEndTimeRef.current = null;
    cancelRestNotification();
    const advance = pendingAdvanceRef.current;
    pendingAdvanceRef.current = null;
    setIsResting(false);
    setRestRemaining(0);
    if (advance) {
      advance();
    } else if (currentSet > totalSets && currentExIdx < exercises.length - 1) {
      setCurrentExIdx(prev => prev + 1);
      setCurrentSet(1);
    }
  };

  const handleClose = async () => {
    if (sessionId) await endSession(sessionId);
    router.back();
  };

  if (!day || !currentExercise) {
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
        <TouchableOpacity style={styles.headerSide} onPress={handleClose}>
          <MaterialIcons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{currentExercise.name}</Text>
          <Text style={styles.headerSub}>SET {currentSet} OF {totalSets}{location?.name ? ` \u00B7 ${location.name}` : ''}</Text>
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
          <Text style={styles.progressPercent}>{progressPercent}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainContent}>
        {isResting ? (
          /* Rest Timer */
          <View style={styles.restContainer}>
            <Text style={styles.restLabel}>REST</Text>
            <Text style={styles.restTimer}>{formatTime(restRemaining)}</Text>
            <TouchableOpacity style={styles.skipRestButton} onPress={handleSkipRest}>
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

            {/* Target Goal */}
            <View style={styles.targetSection}>
              <Text style={styles.targetLabel}>TARGET GOAL</Text>
              <View style={styles.targetValues}>
                <Text style={styles.targetNumber}>{lastLoggedWeight != null ? lastLoggedWeight : (weightUnit === 'lbs' ? Math.round(targetWeight * 2.20462) : targetWeight)}<Text style={styles.targetUnit}>{weightUnit}</Text></Text>
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
                  <Image
                    source={{ uri: exerciseImage.image }}
                    style={styles.exerciseImage}
                    resizeMode="contain"
                  />
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
                  <TouchableOpacity
                    style={styles.unitToggle}
                    onPress={() => {
                      const newUnit = weightUnit === 'kg' ? 'lbs' : 'kg';
                      const converted = snapToIncrement(convertWeight(weight, weightUnit, newUnit), newUnit);
                      setWeight(converted);
                      setWeightUnit(newUnit);
                      setWeightIncrement(getDefaultIncrement(newUnit));
                      setExerciseUnitPreference(currentExercise.name, newUnit);
                    }}
                  >
                    <Text style={styles.unitToggleText}>{weightUnit.toUpperCase()}</Text>
                  </TouchableOpacity>
                  {weightBadge && (
                    <View style={[styles.weightBadge, { backgroundColor: weightBadge.startsWith('+') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                      <Text style={[styles.weightBadgeText, { color: weightBadge.startsWith('+') ? 'rgb(34,197,94)' : 'rgb(239,68,68)' }]}>{weightBadge}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.adjusterControls}>
                  <TouchableOpacity
                    style={styles.adjusterButton}
                    onPress={() => setWeight(w => Math.max(0, w - weightIncrement))}
                  >
                    <MaterialIcons name="remove" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <View style={styles.adjusterValueContainer}>
                    {isEditingWeight ? (
                      <TextInput
                        ref={weightInputRef}
                        style={styles.adjusterValueInput}
                        value={weightInputText}
                        onChangeText={setWeightInputText}
                        keyboardType="decimal-pad"
                        autoFocus
                        selectTextOnFocus
                        onSubmitEditing={() => {
                          const parsed = parseFloat(weightInputText);
                          if (!isNaN(parsed) && parsed >= 0) {
                            setWeight(snapToIncrement(parsed, weightUnit));
                          }
                          setIsEditingWeight(false);
                        }}
                        onBlur={() => {
                          const parsed = parseFloat(weightInputText);
                          if (!isNaN(parsed) && parsed >= 0) {
                            setWeight(snapToIncrement(parsed, weightUnit));
                          }
                          setIsEditingWeight(false);
                        }}
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          setWeightInputText(formatWeight(weight, weightUnit));
                          setIsEditingWeight(true);
                        }}
                      >
                        <Text style={styles.adjusterValue} numberOfLines={1}>{formatWeight(weight, weightUnit)}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        const increments = getIncrements(weightUnit);
                        const idx = increments.indexOf(weightIncrement);
                        setWeightIncrement(increments[(idx + 1) % increments.length]);
                      }}
                    >
                      <Text style={styles.incrementLabel}>±{weightIncrement}</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.adjusterButton}
                    onPress={() => setWeight(w => w + weightIncrement)}
                  >
                    <MaterialIcons name="add" size={22} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Reps adjuster */}
              <View style={styles.adjusterRow}>
                <Text style={styles.adjusterLabel}>Reps</Text>
                <View style={styles.adjusterControls}>
                  <TouchableOpacity
                    style={styles.adjusterButton}
                    onPress={() => setReps(r => Math.max(1, r - 1))}
                  >
                    <MaterialIcons name="remove" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.adjusterValue}>{reps}</Text>
                  <TouchableOpacity
                    style={styles.adjusterButton}
                    onPress={() => setReps(r => r + 1)}
                  >
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

      {/* Bottom Voice Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.voiceBar}>
          {/* AI Response Bubble */}
          {(aiResponse || isAiLoading) && (
            <View style={styles.aiResponseContainer}>
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

          {/* Input Row */}
          {isInputMode ? (
            <View style={styles.voiceBarInner}>
              <TextInput
                ref={inputRef}
                style={styles.chatInput}
                placeholder="Ask your coach..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                autoFocus
                onBlur={() => { if (!inputText.trim()) setIsInputMode(false); }}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={isAiLoading || !inputText.trim()}
                style={styles.sendButton}
              >
                {isAiLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialIcons
                    name="send"
                    size={20}
                    color={inputText.trim() ? colors.primary : 'rgba(212,255,0,0.3)'}
                  />
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.voiceBarInner}
              onPress={() => {
                setAiResponse(null);
                setIsInputMode(true);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.micIcon}>
                <MaterialIcons name="mic" size={18} color={colors.bgDark} />
              </View>
              <Text style={styles.voicePrompt}>"Ready for the next set?"</Text>
              <MaterialIcons name="keyboard" size={20} color="rgba(212,255,0,0.3)" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Rest timer preview (top right, when not resting) */}
      {!isResting && (
        <View style={styles.restPreview}>
          <View style={styles.restPreviewCircle}>
            <Text style={styles.restPreviewTime}>{formatTime(restDuration)}</Text>
          </View>
          <Text style={styles.restPreviewLabel}>NEXT: REST</Text>
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

            {/* Share Workout Card */}
            {shareImage?.image ? (
              <View style={styles.shareImageContainer}>
                <Image
                  source={{ uri: shareImage.image }}
                  style={styles.shareImage}
                  resizeMode="contain"
                />
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
              <TouchableOpacity
                style={styles.shareButton}
                onPress={handleShareWorkout}
                disabled={isShareLoading}
                activeOpacity={0.7}
              >
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
          <TouchableOpacity
            style={styles.rpeHelpButton}
            onPress={() => setShowTooltip(!showTooltip)}
            activeOpacity={0.7}
          >
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
    paddingHorizontal: 8, paddingVertical: 3,
  },
  unitToggleText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.primary },
  incrementLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', color: colors.textSecondary, marginTop: 2 },
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

  // Voice bar
  voiceBar: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, paddingBottom: spacing.lg,
    borderTopWidth: 1, borderTopColor: 'rgba(212,255,0,0.2)',
    backgroundColor: 'rgba(18,20,8,0.9)',
  },
  voiceBarInner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#1c1f0d', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.1)',
  },
  micIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  voicePrompt: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textSecondary, fontStyle: 'italic' },
  chatInput: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  sendButton: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  aiResponseContainer: {
    backgroundColor: 'rgba(212,255,0,0.08)', borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.15)',
    padding: spacing.sm, marginBottom: spacing.xs,
  },
  aiResponseText: {
    fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textPrimary, lineHeight: 19,
  },
  aiLoadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  aiLoadingText: {
    fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, fontStyle: 'italic',
  },

  // Rest preview (top right ghost)
  restPreview: {
    position: 'absolute', top: 110, right: spacing.md,
    alignItems: 'center', gap: 4, opacity: 0.35,
  },
  restPreviewCircle: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  restPreviewTime: { fontSize: 10, fontFamily: 'Inter_500Medium', color: colors.textSecondary },
  restPreviewLabel: { fontSize: 7, fontFamily: 'Inter_700Bold', color: colors.textSecondary, letterSpacing: 1 },

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
  pushBannerTitle: {
    fontSize: 10, fontFamily: 'Inter_800ExtraBold', color: 'rgb(34,197,94)',
    letterSpacing: 2, marginBottom: 4,
  },
  pushBannerText: {
    fontSize: 13, fontFamily: 'Inter_400Regular', color: 'rgba(34,197,94,0.85)',
    lineHeight: 18,
  },

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
  completeTitle: {
    fontSize: 22, fontFamily: 'Inter_800ExtraBold', color: colors.primary,
    letterSpacing: 3,
  },
  completeStatsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: spacing.md, width: '100%',
  },
  completeStat: {
    alignItems: 'center', minWidth: 80, padding: spacing.sm,
    backgroundColor: 'rgba(212,255,0,0.05)', borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.08)',
    flex: 1,
  },
  completeStatValue: {
    fontSize: 24, fontFamily: 'Inter_800ExtraBold', color: colors.textPrimary,
  },
  completeStatLabel: {
    fontSize: 10, fontFamily: 'Inter_500Medium', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: 2,
  },
  completeCoachBubble: {
    width: '100%', backgroundColor: 'rgba(212,255,0,0.08)',
    borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(212,255,0,0.15)',
    padding: spacing.md,
  },
  completeCoachText: {
    fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textPrimary,
    lineHeight: 21, textAlign: 'center',
  },
  completeFinishButton: {
    width: '100%', paddingVertical: 18, borderRadius: radius.lg,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  completeFinishText: {
    fontSize: 18, fontFamily: 'Inter_800ExtraBold', color: colors.bgDark,
    letterSpacing: 2,
  },

  // Weight badge
  weightBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  weightBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },

  // RPE selector
  rpeCard: {
    width: '100%', maxWidth: 340, padding: spacing.lg,
    borderRadius: 24, backgroundColor: 'rgba(28,31,13,0.3)',
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.05)', gap: spacing.sm,
  },
  rpeHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  rpeTitle: {
    fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textPrimary,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  rpeSelectedValue: {
    fontSize: 24, fontFamily: 'Inter_800ExtraBold', color: colors.primary,
  },
  rpeHelpButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4,
  },
  rpeHelpText: {
    fontSize: 10, fontFamily: 'Inter_400Regular', color: 'rgba(212,255,0,0.4)',
  },
  rpeTooltip: {
    position: 'absolute', top: 36, left: 0, zIndex: 10,
    backgroundColor: '#1c1f0d', borderWidth: 1, borderColor: 'rgba(212,255,0,0.2)',
    padding: spacing.sm, borderRadius: radius.sm, width: 200,
  },
  rpeTooltipText: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textSecondary,
  },
  rpeSliderContainer: {
    width: '100%', paddingVertical: spacing.md, paddingHorizontal: spacing.xs,
  },
  rpeSlider: {
    width: '100%', height: 40,
  },
  rpeSliderLabels: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 4, marginTop: 4,
  },
  rpeSliderLabel: {
    fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textSecondary,
  },
  rpeDescription: {
    fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(212,255,0,0.8)',
  },
  rpeDescriptionBold: {
    fontFamily: 'Inter_700Bold',
  },

  // Exercise demo image
  exerciseImageContainer: {
    width: '100%', maxWidth: 340, borderRadius: radius.lg,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  exerciseImage: {
    width: '100%', height: 280, backgroundColor: colors.bgDarker,
  },
  exerciseImageCaption: {
    fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary,
    padding: spacing.md, lineHeight: 19,
  },

  // Share workout
  shareButton: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: 14, borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.3)', backgroundColor: 'rgba(212,255,0,0.05)',
  },
  shareButtonText: {
    fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.primary,
  },
  shareImageContainer: {
    width: '100%', alignItems: 'center', gap: spacing.sm,
  },
  shareImage: {
    width: '100%', height: 320, borderRadius: radius.md,
  },
  shareActionButton: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.primary,
  },
  shareActionText: {
    fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.bgDark,
  },
});
