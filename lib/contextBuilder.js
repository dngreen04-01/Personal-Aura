/**
 * Unified frontend context builder.
 * Replaces 4 copy-pasted context objects across 3 files with a single function.
 * Output shape is backward-compatible with the server's existing field names.
 */
export function buildUserContext({ profile, workout, exercise, progression, location, completion, motivation }) {
  return {
    goal: profile?.goal || null,
    equipment: location?.equipment_list
      ? (Array.isArray(location.equipment_list) ? location.equipment_list : JSON.parse(location.equipment_list))
      : (profile?.equipment || null),
    weightKg: profile?.weight_kg || null,
    gender: profile?.gender || null,
    age: profile?.age || null,
    currentDay: workout || null,
    sessionId: exercise?.sessionId || null,
    currentExercise: exercise?.name || null,
    currentSet: exercise?.currentSet || null,
    targetReps: exercise?.targetReps || null,
    currentWeight: exercise?.currentWeight || null,
    weightUnit: exercise?.weightUnit || 'kg',
    isResting: exercise?.isResting || false,
    locationId: location?.id || null,
    locationName: location?.name || null,
    locationEquipment: location?.equipment_list
      ? (Array.isArray(location.equipment_list) ? location.equipment_list : JSON.parse(location.equipment_list))
      : null,
    planSummary: workout?.exercises
      ?.map(e => `${e.name} ${e.sets}x${e.reps} @ ${e.targetWeight}`)
      .join(', ') || null,
    progression: progression ? {
      suggestedWeight: progression.suggestedWeight,
      avgRpe: progression.avgRpe,
      isPlateaued: progression.isPlateaued,
      pushReason: progression.pushReason,
    } : null,
    workoutComplete: completion || null,
    exerciseMaxWeight: motivation?.exerciseMaxWeight || null,
    streakData: motivation?.streakData || null,
    completedSessions: motivation?.completedSessions || null,
  };
}
