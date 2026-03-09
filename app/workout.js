import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { colors, spacing, radius } from '../lib/theme';
import { startSession, endSession, logSet as dbLogSet, getExerciseProgressionData } from '../lib/database';

export default function WorkoutScreen() {
  const router = useRouter();
  const { dayJson, startIdx } = useLocalSearchParams();
  const day = dayJson ? JSON.parse(dayJson) : null;

  const [sessionId, setSessionId] = useState(null);
  const [currentExIdx, setCurrentExIdx] = useState(parseInt(startIdx) || 0);
  const [currentSet, setCurrentSet] = useState(1);
  const [isResting, setIsResting] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const [rpe, setRpe] = useState(null);
  const [weightBadge, setWeightBadge] = useState(null);

  const exercises = day?.exercises || [];
  const currentExercise = exercises[currentExIdx];
  const totalSets = parseInt(currentExercise?.sets) || 4;
  const targetReps = parseInt(currentExercise?.reps) || 8;
  const targetWeight = parseFloat(currentExercise?.targetWeight) || 0;
  const restDuration = parseInt(currentExercise?.restSeconds) || 90;

  const [weight, setWeight] = useState(targetWeight);
  const [reps, setReps] = useState(targetReps);
  const [pushSuggestion, setPushSuggestion] = useState(null);

  // Reset weight/reps/rpe when exercise changes, apply progressive overload
  useEffect(() => {
    if (currentExercise) {
      const planWeight = parseFloat(currentExercise.targetWeight) || 0;
      setReps(parseInt(currentExercise.reps) || 8);
      setRpe(null);
      setWeightBadge(null);
      setPushSuggestion(null);

      (async () => {
        try {
          const progression = await getExerciseProgressionData(currentExercise.name);
          if (progression.suggestedWeight && progression.suggestedWeight !== planWeight) {
            setWeight(progression.suggestedWeight);
            const diff = progression.suggestedWeight - planWeight;
            if (diff > 0) {
              setWeightBadge(`+${diff}kg`);
            } else {
              setWeightBadge(`${Math.round(((progression.suggestedWeight / planWeight) - 1) * 100)}%`);
            }
            // Show push suggestion when AI recommends increasing
            if (progression.pushReason && progression.suggestedWeight > planWeight) {
              setPushSuggestion(progression.pushReason);
            }
          } else {
            setWeight(planWeight);
          }
        } catch {
          setWeight(planWeight);
        }
      })();
    }
  }, [currentExIdx]);

  // Start session
  useEffect(() => {
    const init = async () => {
      if (day) {
        const id = await startSession(day.day, day.focus);
        setSessionId(id);
      }
    };
    init();
  }, []);

  // Rest timer
  useEffect(() => {
    if (!isResting || restRemaining <= 0) return;
    const interval = setInterval(() => {
      setRestRemaining(t => {
        if (t <= 1) {
          setIsResting(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isResting, restRemaining]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Calculate total sets completed across all exercises up to current
  const completedSets = exercises.slice(0, currentExIdx).reduce((sum, e) => sum + (parseInt(e.sets) || 3), 0) + (currentSet - 1);
  const grandTotalSets = exercises.reduce((sum, e) => sum + (parseInt(e.sets) || 3), 0);
  const progressPercent = grandTotalSets > 0 ? Math.round((completedSets / grandTotalSets) * 100) : 0;

  const handleDone = async () => {
    // Log to DB
    if (sessionId && currentExercise) {
      await dbLogSet(sessionId, currentExercise.name, currentSet, weight, 'kg', reps, rpe, restDuration);
    }

    // Start rest
    setIsResting(true);
    setRestRemaining(restDuration);

    // Advance set/exercise after rest
    if (currentSet >= totalSets) {
      // Move to next exercise
      if (currentExIdx < exercises.length - 1) {
        setTimeout(() => {
          setCurrentExIdx(prev => prev + 1);
          setCurrentSet(1);
          setIsResting(false);
          setRestRemaining(0);
        }, restDuration * 1000);
      } else {
        // Workout complete
        setTimeout(async () => {
          if (sessionId) await endSession(sessionId);
          router.back();
        }, restDuration * 1000);
      }
    } else {
      setCurrentSet(prev => prev + 1);
    }
  };

  const handleSkipRest = () => {
    setIsResting(false);
    setRestRemaining(0);
    if (currentSet > totalSets && currentExIdx < exercises.length - 1) {
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
          <Text style={styles.headerSub}>SET {currentSet} OF {totalSets}</Text>
        </View>
        <TouchableOpacity style={styles.headerSide}>
          <View style={styles.settingsButton}>
            <MaterialIcons name="settings" size={20} color={colors.primary} />
          </View>
        </TouchableOpacity>
      </View>

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
                <Text style={styles.targetNumber}>{targetWeight}<Text style={styles.targetUnit}>kg</Text></Text>
                <Text style={styles.targetX}> × </Text>
                <Text style={styles.targetNumber}>{targetReps}<Text style={styles.targetUnit}>Reps</Text></Text>
              </View>
              <TouchableOpacity style={styles.formGuideButton}>
                <MaterialIcons name="info-outline" size={16} color={colors.primary} />
                <Text style={styles.formGuideText}>Form Guide</Text>
              </TouchableOpacity>
            </View>

            {/* Adjusters */}
            <View style={styles.adjustCard}>
              {/* Weight adjuster */}
              <View style={styles.adjusterRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Text style={styles.adjusterLabel}>Weight (kg)</Text>
                  {weightBadge && (
                    <View style={[styles.weightBadge, { backgroundColor: weightBadge.startsWith('+') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                      <Text style={[styles.weightBadgeText, { color: weightBadge.startsWith('+') ? 'rgb(34,197,94)' : 'rgb(239,68,68)' }]}>{weightBadge}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.adjusterControls}>
                  <TouchableOpacity
                    style={styles.adjusterButton}
                    onPress={() => setWeight(w => Math.max(0, w - 2.5))}
                  >
                    <MaterialIcons name="remove" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.adjusterValue}>{weight}</Text>
                  <TouchableOpacity
                    style={styles.adjusterButton}
                    onPress={() => setWeight(w => w + 2.5)}
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
      <View style={styles.voiceBar}>
        <View style={styles.voiceBarInner}>
          <View style={styles.micIcon}>
            <MaterialIcons name="mic" size={18} color={colors.bgDark} />
          </View>
          <Text style={styles.voicePrompt}>"Ready for the next set?"</Text>
          <MaterialIcons name="keyboard" size={20} color="rgba(212,255,0,0.3)" />
        </View>
      </View>

      {/* Rest timer preview (top right, when not resting) */}
      {!isResting && (
        <View style={styles.restPreview}>
          <View style={styles.restPreviewCircle}>
            <Text style={styles.restPreviewTime}>{formatTime(restDuration)}</Text>
          </View>
          <Text style={styles.restPreviewLabel}>NEXT: REST</Text>
        </View>
      )}
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
  adjusterControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  adjusterButton: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: 'rgba(212,255,0,0.1)', borderWidth: 1, borderColor: 'rgba(212,255,0,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  adjusterValue: { fontSize: 24, fontFamily: 'Inter_700Bold', color: colors.textPrimary, width: 48, textAlign: 'center' },
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
});
