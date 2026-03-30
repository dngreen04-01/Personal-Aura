import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getTimeOfDayBucket,
  buildGreetingCacheKey,
  getCachedGreeting,
  cacheGreeting,
} from '../../lib/greetingCache';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTimeOfDayBucket', () => {
  const testCases = [
    [0, 'evening'], [1, 'evening'], [4, 'evening'],
    [5, 'morning'], [8, 'morning'], [11, 'morning'],
    [12, 'afternoon'], [14, 'afternoon'], [16, 'afternoon'],
    [17, 'evening'], [20, 'evening'], [23, 'evening'],
  ];

  test.each(testCases)('hour %i → %s', (hour, expected) => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(hour);
    expect(getTimeOfDayBucket()).toBe(expected);
    jest.restoreAllMocks();
  });
});

describe('buildGreetingCacheKey', () => {
  beforeEach(() => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9); // morning
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseContext = {
    streak: { current: 3 },
    sessionCount: 10,
    lastWorkoutFocus: 'Push',
    todayFocus: 'Pull',
    todayExerciseCount: 5,
  };

  test('returns same hash for identical context', () => {
    const key1 = buildGreetingCacheKey(baseContext);
    const key2 = buildGreetingCacheKey({ ...baseContext });
    expect(key1).toBe(key2);
  });

  test('returns different hash when streak changes', () => {
    const key1 = buildGreetingCacheKey(baseContext);
    const key2 = buildGreetingCacheKey({ ...baseContext, streak: { current: 4 } });
    expect(key1).not.toBe(key2);
  });

  test('returns different hash when todayFocus changes', () => {
    const key1 = buildGreetingCacheKey(baseContext);
    const key2 = buildGreetingCacheKey({ ...baseContext, todayFocus: 'Legs' });
    expect(key1).not.toBe(key2);
  });

  test('returns different hash when time-of-day bucket changes', () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9);
    const morningKey = buildGreetingCacheKey(baseContext);
    jest.restoreAllMocks();
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14);
    const afternoonKey = buildGreetingCacheKey(baseContext);
    expect(morningKey).not.toBe(afternoonKey);
  });

  test('handles null/undefined fields gracefully', () => {
    const key = buildGreetingCacheKey({});
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  test('handles numeric streak (non-object)', () => {
    const key1 = buildGreetingCacheKey({ ...baseContext, streak: 3 });
    const key2 = buildGreetingCacheKey({ ...baseContext, streak: 3 });
    expect(key1).toBe(key2);
  });
});

describe('getCachedGreeting', () => {
  test('returns cached text on key match', async () => {
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({ key: 'abc', text: 'Good morning!' })
    );
    const result = await getCachedGreeting('abc');
    expect(result).toEqual({ text: 'Good morning!' });
  });

  test('returns null on key mismatch', async () => {
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({ key: 'abc', text: 'Good morning!' })
    );
    const result = await getCachedGreeting('xyz');
    expect(result).toBeNull();
  });

  test('returns null when storage is empty', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);
    const result = await getCachedGreeting('abc');
    expect(result).toBeNull();
  });

  test('returns null on corrupt JSON', async () => {
    AsyncStorage.getItem.mockResolvedValue('not valid json{{{');
    const result = await getCachedGreeting('abc');
    expect(result).toBeNull();
  });

  test('returns null on AsyncStorage failure', async () => {
    AsyncStorage.getItem.mockRejectedValue(new Error('Storage unavailable'));
    const result = await getCachedGreeting('abc');
    expect(result).toBeNull();
  });
});

describe('cacheGreeting', () => {
  test('stores greeting with key and text', async () => {
    AsyncStorage.setItem.mockResolvedValue(undefined);
    await cacheGreeting('abc', 'Good morning!');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@aura_greeting_cache',
      expect.any(String)
    );
    const stored = JSON.parse(AsyncStorage.setItem.mock.calls[0][1]);
    expect(stored.key).toBe('abc');
    expect(stored.text).toBe('Good morning!');
    expect(stored.cachedAt).toEqual(expect.any(Number));
  });

  test('silently handles write failure', async () => {
    AsyncStorage.setItem.mockRejectedValue(new Error('Storage full'));
    await expect(cacheGreeting('abc', 'Hello')).resolves.toBeUndefined();
  });
});

describe('round-trip', () => {
  test('cacheGreeting then getCachedGreeting returns the greeting', async () => {
    let stored = null;
    AsyncStorage.setItem.mockImplementation((key, value) => {
      stored = value;
      return Promise.resolve();
    });
    AsyncStorage.getItem.mockImplementation(() => Promise.resolve(stored));

    await cacheGreeting('key123', 'Hey, ready to crush it?');
    const result = await getCachedGreeting('key123');
    expect(result).toEqual({ text: 'Hey, ready to crush it?' });
  });
});
