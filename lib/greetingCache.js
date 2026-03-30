import AsyncStorage from '@react-native-async-storage/async-storage';

const GREETING_CACHE_KEY = '@aura_greeting_cache';

/**
 * Returns 'morning' | 'afternoon' | 'evening' based on current local hour.
 * Morning: 5:00-11:59, Afternoon: 12:00-16:59, Evening: 17:00-4:59
 */
export function getTimeOfDayBucket() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Build a deterministic cache key from greeting context + time-of-day bucket.
 * Uses djb2 hash for a short, collision-resistant string.
 */
export function buildGreetingCacheKey(context) {
  const keyFields = {
    streak: context.streak?.current ?? context.streak ?? 0,
    sessionCount: context.sessionCount ?? 0,
    lastWorkoutFocus: context.lastWorkoutFocus ?? '',
    todayFocus: context.todayFocus ?? '',
    todayExerciseCount: context.todayExerciseCount ?? 0,
    timeOfDayBucket: getTimeOfDayBucket(),
  };
  const raw = JSON.stringify(keyFields);
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) & 0xffffffff;
  }
  return String(hash >>> 0);
}

/**
 * Retrieve cached greeting if the cache key matches.
 * Returns { text: string } | null.
 */
export async function getCachedGreeting(cacheKey) {
  try {
    const raw = await AsyncStorage.getItem(GREETING_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached.key === cacheKey && cached.text) {
      return { text: cached.text };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Store greeting text with its cache key.
 */
export async function cacheGreeting(cacheKey, text) {
  try {
    await AsyncStorage.setItem(
      GREETING_CACHE_KEY,
      JSON.stringify({ key: cacheKey, text, cachedAt: Date.now() })
    );
  } catch {
    // Cache write failure is non-critical
  }
}
