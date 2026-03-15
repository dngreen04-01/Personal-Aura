const { getWorkoutStreak, updateUserProfile } = require('../services/firestore');
const { sendPushNotification } = require('../services/notifications');
const { runForAllUsers, logJobResult } = require('../services/scheduler');

const MILESTONE_DAYS = [7, 14, 30, 60, 100];

async function processUser(uid) {
  const streak = await getWorkoutStreak(uid);

  // Update streak data on profile
  await updateUserProfile(uid, {
    currentStreak: streak.current,
    longestStreak: Math.max(streak.current, streak.longest),
    lastWorkoutDate: streak.lastWorkoutDate,
  });

  // Check for milestones
  if (streak.current > 0 && MILESTONE_DAYS.includes(streak.current)) {
    await sendPushNotification(uid, {
      title: `${streak.current}-Day Streak!`,
      body: `You've worked out ${streak.current} days in a row. Keep the momentum going!`,
      data: { type: 'streak_milestone', days: streak.current },
    });
    return 'milestone';
  }

  // Streak at risk: user hasn't worked out today but has an active streak
  if (streak.current > 0 && streak.lastWorkoutDate) {
    const today = new Date().toISOString().substring(0, 10);
    if (streak.lastWorkoutDate !== today) {
      await sendPushNotification(uid, {
        title: 'Keep Your Streak Alive!',
        body: `You're on a ${streak.current}-day streak. Don't let it slip!`,
        data: { type: 'streak_reminder', days: streak.current },
      });
      return 'reminder';
    }
  }

  return 'skipped';
}

async function runStreakChecker() {
  const stats = await runForAllUsers(processUser);
  logJobResult('streak-checker', stats);
  return stats;
}

module.exports = { runStreakChecker };
