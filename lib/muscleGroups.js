export const CATEGORIES = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];

export const EXERCISE_CATEGORIES = ['All', 'Push', 'Pull', 'Legs', 'Core', 'Compound', 'Cardio'];

const MUSCLE_MAP = {
  chest: [
    'bench press', 'chest press', 'push up', 'pushup', 'push-up',
    'chest fly', 'pec deck', 'dumbbell fly', 'incline press',
    'decline press', 'cable crossover', 'dip',
  ],
  back: [
    'pull up', 'pullup', 'pull-up', 'chin up', 'chinup', 'chin-up',
    'row', 'lat pulldown', 'deadlift', 'back extension',
    'face pull', 'shrug', 't-bar', 'seated row', 'bent over',
  ],
  legs: [
    'squat', 'lunge', 'leg press', 'leg curl', 'leg extension',
    'calf raise', 'hip thrust', 'romanian deadlift', 'rdl',
    'step up', 'step-up', 'goblet', 'hack squat', 'bulgarian',
    'glute bridge', 'hamstring', 'quad',
  ],
  shoulders: [
    'overhead press', 'shoulder press', 'military press',
    'lateral raise', 'front raise', 'rear delt', 'arnold press',
    'upright row', 'face pull', 'deltoid',
  ],
  arms: [
    'bicep curl', 'hammer curl', 'tricep', 'skull crusher',
    'preacher curl', 'concentration curl', 'cable curl',
    'tricep extension', 'tricep pushdown', 'kickback',
    'barbell curl', 'dumbbell curl', 'ez bar curl',
  ],
  core: [
    'crunch', 'sit up', 'situp', 'sit-up', 'plank', 'ab ',
    'russian twist', 'leg raise', 'mountain climber',
    'wood chop', 'cable crunch', 'hanging', 'oblique',
    'dead bug', 'bird dog', 'hollow',
  ],
};

export function getMuscleGroup(exerciseName) {
  const name = (exerciseName || '').toLowerCase().trim();
  for (const [group, keywords] of Object.entries(MUSCLE_MAP)) {
    if (keywords.some(kw => name.includes(kw))) {
      return group.charAt(0).toUpperCase() + group.slice(1);
    }
  }
  return 'Other';
}
