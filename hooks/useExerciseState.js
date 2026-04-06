import { useState, useEffect } from 'react';
import { getExerciseUnitPreference, getExerciseMaxWeight, getWorkoutStreak, getCompletedSessionCount, getExerciseProgressionData, getCachedExercisesByNames } from '../lib/database';
import { formatWeightBadge, getDefaultIncrement } from '../lib/weightUtils';

/**
 * Manages per-exercise state: weight, reps, RPE, unit preference, progressive
 * overload suggestions, milestone data, and library cache lookup.
 * Resets when currentExIdx changes.
 */
export default function useExerciseState({ exercises, currentExIdx, userProfile }) {
  const currentExercise = exercises[currentExIdx];
  const targetReps = parseInt(currentExercise?.reps) || 8;
  const targetWeight = parseFloat(currentExercise?.targetWeight) || 0;

  const [weight, setWeight] = useState(targetWeight);
  const [lastLoggedWeight, setLastLoggedWeight] = useState(null);
  const [reps, setReps] = useState(targetReps);
  const [rpe, setRpe] = useState(null);
  const [weightUnit, setWeightUnit] = useState('kg');
  const [weightBadge, setWeightBadge] = useState(null);
  const [isEstimatedWeight, setIsEstimatedWeight] = useState(false);
  const [pushSuggestion, setPushSuggestion] = useState(null);
  const [exerciseMaxWeight, setExerciseMaxWeight] = useState(null);
  const [streakData, setStreakData] = useState(null);
  const [completedSessions, setCompletedSessions] = useState(null);
  const [weightIncrement, setWeightIncrement] = useState(2.5);
  const [libraryExercise, setLibraryExercise] = useState(null);
  const [exerciseImage, setExerciseImage] = useState(null);
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [weightInputText, setWeightInputText] = useState('');

  useEffect(() => {
    if (!currentExercise) return;

    const planWeightKg = parseFloat(currentExercise.targetWeight) || 0;
    setReps(parseInt(currentExercise.reps) || 8);
    setRpe(null);
    setWeightBadge(null);
    setPushSuggestion(null);
    setLastLoggedWeight(null);
    setIsEditingWeight(false);
    setExerciseImage(null);
    setLibraryExercise(null);
    setIsEstimatedWeight(false);

    getCachedExercisesByNames([currentExercise.name])
      .then(results => { if (results.length > 0) setLibraryExercise(results[0]); })
      .catch(() => {});

    (async () => {
      try {
        const unit = await getExerciseUnitPreference(currentExercise.name);
        setWeightUnit(unit);
        setWeightIncrement(getDefaultIncrement(unit, currentExercise.name));

        const [maxW, streak, sessions] = await Promise.all([
          getExerciseMaxWeight(currentExercise.name),
          getWorkoutStreak(),
          getCompletedSessionCount(),
        ]);
        setExerciseMaxWeight(maxW);
        setStreakData(streak);
        setCompletedSessions(sessions);

        const progression = await getExerciseProgressionData(currentExercise.name, 4, unit);
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
          const isFirstTime = progression.weights.length === 0 && planWeightDisplay > 0;
          const isMarkedEstimated = currentExercise.isEstimated === true;
          setIsEstimatedWeight(isFirstTime || isMarkedEstimated);
        }
      } catch {
        const planWeightDisplay = weightUnit === 'lbs' ? Math.round(planWeightKg * 2.20462) : planWeightKg;
        setWeight(planWeightDisplay);
      }
    })();
  }, [currentExIdx]);

  return {
    weight, setWeight,
    lastLoggedWeight, setLastLoggedWeight,
    reps, setReps,
    rpe, setRpe,
    weightUnit, setWeightUnit,
    weightBadge,
    isEstimatedWeight, setIsEstimatedWeight,
    pushSuggestion, setPushSuggestion,
    exerciseMaxWeight,
    streakData,
    completedSessions,
    weightIncrement, setWeightIncrement,
    libraryExercise,
    exerciseImage, setExerciseImage,
    isEditingWeight, setIsEditingWeight,
    weightInputText, setWeightInputText,
  };
}
