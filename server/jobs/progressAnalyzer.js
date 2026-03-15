const { GoogleGenAI } = require('@google/genai');
const { getUserSessions, getSessionSets, getWorkoutStreak, saveInsight } = require('../services/firestore');
const { sendPushNotification } = require('../services/notifications');
const { runForAllUsers, logJobResult } = require('../services/scheduler');

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

function getWeekId(date = new Date()) {
  // ISO 8601 week number
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Set to nearest Thursday: current date + 4 - day number (Sunday = 7)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

async function processUser(uid) {
  const sessions = await getUserSessions(uid, { days: 7 });
  if (sessions.length === 0) return 'skipped';

  // Compute weekly stats
  let totalVolume = 0;
  let totalSets = 0;
  const exerciseMaxes = {};

  for (const session of sessions) {
    const sets = await getSessionSets(uid, session.id);
    for (const set of sets) {
      const weight = set.weight || 0;
      const reps = set.reps || 0;
      totalVolume += weight * reps;
      totalSets++;

      const name = set.exerciseName;
      if (name && weight > (exerciseMaxes[name] || 0)) {
        exerciseMaxes[name] = weight;
      }
    }
  }

  const streak = await getWorkoutStreak(uid);

  const weekStats = {
    sessionCount: sessions.length,
    totalVolume: Math.round(totalVolume),
    totalSets,
    streak: streak.current,
    prs: Object.entries(exerciseMaxes).map(([name, weight]) => ({
      exercise: name,
      weight,
    })),
    topExercise: Object.entries(exerciseMaxes)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null,
  };

  // Generate AI insight
  const apiKey = process.env.GEMINI_API_KEY;
  let insightText = `Great week! You completed ${weekStats.sessionCount} sessions with ${weekStats.totalVolume}kg total volume.`;

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Weekly workout stats:\n${JSON.stringify(weekStats, null, 2)}\n\nGenerate a short motivating weekly summary (2-3 sentences). Reference specific numbers.`,
        config: {
          systemInstruction: 'You are Aura, an elite fitness AI. Generate a short, punchy weekly workout summary. Be specific with numbers and encouraging.',
        },
      });
      insightText = response.text;
    } catch (err) {
      console.error(JSON.stringify({
        severity: 'WARNING',
        message: 'AI insight generation failed, using fallback',
        uid,
        error: err.message,
      }));
    }
  }

  // Save insight to Firestore
  const weekId = getWeekId();
  await saveInsight(uid, weekId, {
    ...weekStats,
    insight: insightText,
    weekId,
  });

  // Send push notification with highlight
  await sendPushNotification(uid, {
    title: 'Your Weekly Progress',
    body: insightText.substring(0, 150),
    data: { type: 'weekly_insight', weekId },
  });

  return 'analyzed';
}

async function runProgressAnalyzer() {
  const stats = await runForAllUsers(processUser, { hasSessionsSince: 7 });
  logJobResult('progress-analyzer', stats);
  return stats;
}

module.exports = { runProgressAnalyzer };
