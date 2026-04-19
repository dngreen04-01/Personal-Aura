// aura-data.jsx — Demo data: user, workout, messages, history

const USER = {
  name: 'Alex',
  firstName: 'Alex',
  streak: 12,
  sessionCount: 34,
  goal: 'Build strength, bench PR',
  weekProgress: { completed: 3, total: 5 },
};

// Today's mixed session — barbell + accessory + finisher
const WORKOUT = {
  id: 'w-mon-1',
  date: 'Monday, April 19',
  focus: 'Push — Chest, Shoulders, Triceps',
  estimatedDuration: 52,
  exercises: [
    {
      id: 'bench',
      name: 'Barbell Bench Press',
      category: 'Compound',
      sets: 4,
      reps: '5',
      targetWeight: 82.5,
      unit: 'kg',
      lastPR: { weight: 80, date: 'Apr 12', reps: 5 },
      muscleGroups: ['Chest', 'Triceps', 'Shoulders'],
      rest: 180,
      cue: "Drive through your heels. Elbows tucked ~45°.",
    },
    {
      id: 'ohp',
      name: 'Overhead Press',
      category: 'Compound',
      sets: 4,
      reps: '6',
      targetWeight: 47.5,
      unit: 'kg',
      lastPR: { weight: 45, date: 'Apr 8', reps: 6 },
      muscleGroups: ['Shoulders', 'Triceps'],
      rest: 150,
      cue: 'Squeeze glutes. Bar over mid-foot at lockout.',
    },
    {
      id: 'incline-db',
      name: 'Incline Dumbbell Press',
      category: 'Accessory',
      sets: 3,
      reps: '8–10',
      targetWeight: 27.5,
      unit: 'kg',
      lastPR: { weight: 25, date: 'Apr 12', reps: 10 },
      muscleGroups: ['Chest', 'Shoulders'],
      rest: 90,
      cue: 'Controlled descent. Stop 2" from chest.',
    },
    {
      id: 'lateral',
      name: 'Lateral Raises',
      category: 'Accessory',
      sets: 3,
      reps: '12',
      targetWeight: 10,
      unit: 'kg',
      lastPR: null,
      muscleGroups: ['Shoulders'],
      rest: 60,
      cue: 'Lead with elbows. Pause at shoulder height.',
    },
    {
      id: 'tricep-pushdown',
      name: 'Tricep Pushdowns',
      category: 'Accessory',
      sets: 3,
      reps: '12',
      targetWeight: 25,
      unit: 'kg',
      lastPR: null,
      muscleGroups: ['Triceps'],
      rest: 60,
      cue: 'Elbows pinned to your sides.',
    },
    {
      id: 'pushup-finisher',
      name: 'Push-up Finisher',
      category: 'Finisher',
      sets: 1,
      reps: 'AMRAP',
      targetWeight: null,
      unit: 'bw',
      lastPR: { weight: null, date: 'Apr 12', reps: 28 },
      muscleGroups: ['Chest', 'Triceps'],
      rest: 0,
      cue: "Go till failure. Last push of the day.",
    },
  ],
};

// PR history for the bench — used in coach tips
const BENCH_HISTORY = [
  { date: 'Jan 20', weight: 60 },
  { date: 'Feb 03', weight: 65 },
  { date: 'Feb 17', weight: 70 },
  { date: 'Mar 03', weight: 72.5 },
  { date: 'Mar 17', weight: 75 },
  { date: 'Mar 31', weight: 77.5 },
  { date: 'Apr 12', weight: 80 },
  { date: 'Apr 19', weight: 82.5 }, // today's target
];

// Volume trend (last 8 weeks, total kg moved)
const VOLUME_TREND = [
  { week: 'W1', volume: 8200 },
  { week: 'W2', volume: 9400 },
  { week: 'W3', volume: 9800 },
  { week: 'W4', volume: 9100 },
  { week: 'W5', volume: 10500 },
  { week: 'W6', volume: 11200 },
  { week: 'W7', volume: 11800 },
  { week: 'W8', volume: 12400 },
];

// 12-week heatmap (consistency) — days since Jan, 0=rest,1-4=intensity
const CONSISTENCY = (() => {
  const days = [];
  // 12 weeks × 7 days = 84
  const rng = (i) => {
    // deterministic-ish: some zeros, varied intensities
    const seed = (i * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 84; i++) {
    const r = rng(i);
    // sundays (i%7===6) often rest
    if (i % 7 === 6) { days.push(r > 0.7 ? 1 : 0); continue; }
    if (r < 0.18) days.push(0);
    else if (r < 0.45) days.push(1);
    else if (r < 0.75) days.push(2);
    else if (r < 0.92) days.push(3);
    else days.push(4);
  }
  // last 3 days guaranteed workouts for streak narrative
  days[81] = 3; days[82] = 2; days[83] = 3;
  return days;
})();

// PRs list
const PRS = [
  { exercise: 'Bench Press', weight: 80, unit: 'kg', reps: 5, date: 'Apr 12', trend: +5, isNew: false },
  { exercise: 'Overhead Press', weight: 45, unit: 'kg', reps: 6, date: 'Apr 8', trend: +2.5, isNew: false },
  { exercise: 'Deadlift', weight: 140, unit: 'kg', reps: 3, date: 'Apr 15', trend: +7.5, isNew: true },
  { exercise: 'Back Squat', weight: 110, unit: 'kg', reps: 5, date: 'Apr 10', trend: +5, isNew: false },
  { exercise: 'Pull-ups', weight: null, unit: 'reps', reps: 12, date: 'Apr 14', trend: +2, isNew: false },
];

// Muscle group recency (days since last trained) — for heatmap
const MUSCLE_RECENCY = [
  { group: 'Chest', days: 0, sessions4w: 7 },
  { group: 'Back', days: 1, sessions4w: 8 },
  { group: 'Shoulders', days: 0, sessions4w: 6 },
  { group: 'Triceps', days: 0, sessions4w: 7 },
  { group: 'Biceps', days: 1, sessions4w: 5 },
  { group: 'Quads', days: 2, sessions4w: 6 },
  { group: 'Hamstrings', days: 2, sessions4w: 4 },
  { group: 'Glutes', days: 2, sessions4w: 5 },
  { group: 'Calves', days: 4, sessions4w: 3 },
  { group: 'Core', days: 1, sessions4w: 7 },
];

// Initial chat messages (scripted demo conversation)
// role: 'user' | 'aura' | 'plan' (inline workout card) | 'system'
const INITIAL_MESSAGES = [
  {
    id: 'm1',
    role: 'aura',
    text: "Morning, Alex. 12-day streak — that's real momentum. 💪\n\nLast Monday you benched **80 kg × 5**, clean. Want to try for **82.5 × 5** today? Or I can keep it at 80 and push reps.",
    time: '8:32 AM',
    chips: ['Push to 82.5', 'Keep 80, more reps', 'Swap to something else'],
  },
  {
    id: 'm2',
    role: 'user',
    text: "Let's push to 82.5. Feeling good today.",
    time: '8:33 AM',
  },
  {
    id: 'm3',
    role: 'aura',
    text: "Love it. Building a **push session** — bench heavy, then OHP, accessories, and a finisher. About 50 minutes.\n\nYou training at Iron Works this morning?",
    time: '8:33 AM',
    chips: ['Yes', 'Home gym today'],
  },
  {
    id: 'm4',
    role: 'user',
    text: 'Yes, at Iron Works',
    time: '8:34 AM',
  },
  {
    id: 'm5',
    role: 'aura',
    text: "Perfect. Here's today's plan. Start whenever you're warm.",
    time: '8:34 AM',
    attachment: { kind: 'workout', workoutId: 'w-mon-1' },
  },
];

// Canned AI replies for unscripted user input (keyword-based)
const AURA_REPLIES = [
  {
    match: /bench|chest/i,
    replies: [
      "Your bench has gone up **22.5 kg in 12 weeks** — one of the fastest progressions I've tracked. The 82.5 today would be a new PR.",
      "Bench-wise: you've been consistently hitting 5×5 on the top set. Today's jump is well within your capacity.",
    ],
  },
  {
    match: /tired|sore|rough|bad day|low energy/i,
    replies: [
      "Got it. Let's pull volume back 15% and keep the top set. Rather skip today entirely? A rest day now beats a bad session.",
      "Totally fine. Want me to swap this for a lighter 30-min mobility + light pump session?",
    ],
  },
  {
    match: /pr|personal record|record/i,
    replies: [
      "Your last PR was **deadlift 140 × 3** on Apr 15 — massive. If you nail 82.5 today, that's PR #8 this cycle.",
    ],
  },
  {
    match: /swap|change|different|replace/i,
    replies: [
      "Sure — what are you in the mood for? I can rebuild this as a pull session, legs, or a full-body circuit.",
    ],
  },
  {
    match: /.*/, // fallback
    replies: [
      "Noted. I'll factor that into next session's plan.",
      "Good to know — I'll adjust.",
      "Got it. Anything else before we start?",
    ],
  },
];

// Inspirational tips Aura drops mid-workout
const AURA_TIPS = {
  bench: [
    "Last week you got 80×5 with **2 reps in reserve**. 82.5 is the right ask.",
    "Keep your shoulder blades pinned. Same setup as last week.",
    "You logged this exact weight as a **single** back in March. Now you're doing 5.",
  ],
  ohp: [
    "Lock out fully — that's where the strength gain lives.",
  ],
  general: [
    "Breathe. You've done the hard part by showing up.",
    "Form over weight. Always.",
  ],
};

Object.assign(window, {
  USER, WORKOUT, BENCH_HISTORY, VOLUME_TREND, CONSISTENCY,
  PRS, MUSCLE_RECENCY, INITIAL_MESSAGES, AURA_REPLIES, AURA_TIPS,
});
