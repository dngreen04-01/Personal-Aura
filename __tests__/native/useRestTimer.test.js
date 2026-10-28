/**
 * hooks/useRestTimer — countdown, alarm, Begin Set / +15s, and recovery after
 * the app is backgrounded or killed.
 *
 * lib/notifications runs for real against the fake notifee in setup.js, so
 * these assertions are about what the user would actually see and hear.
 * `test.failing` marks review bugs that are still present (see
 * notifications.test.js for the convention).
 */
import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';

// Single-row rest timer table, as in lib/database.
let mockTimerRow = null;
jest.mock('../../lib/database', () => ({
  saveRestTimer: jest.fn(async (restEndTime, sessionId, exerciseName, setNumber, totalSets, exerciseIndex, totalExercises, restId) => {
    mockTimerRow = { rest_end_time: restEndTime, session_id: sessionId, exercise_name: exerciseName, set_number: setNumber, total_sets: totalSets, exercise_index: exerciseIndex, total_exercises: totalExercises, rest_id: restId, alarm_fired_at: null };
  }),
  getActiveRestTimer: jest.fn(async () => mockTimerRow),
  clearRestTimer: jest.fn(async () => { mockTimerRow = null; }),
  markRestTimerAlarmFired: jest.fn(async (at) => { if (mockTimerRow) mockTimerRow.alarm_fired_at = at; }),
  saveSessionState: jest.fn(async () => {}),
}));

const useRestTimer = require('../../hooks/useRestTimer').default;
const notifeeState = () => require('@notifee/react-native').__state;
const avState = () => require('expo-av').__state;

let appStateListeners = [];
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-28T08:00:00Z') });
  mockTimerRow = null;
  notifeeState().reset();
  avState().reset();
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, cb) => {
    appStateListeners.push(cb);
    return { remove: () => { appStateListeners = appStateListeners.filter((l) => l !== cb); } };
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const setAppState = async (state) => {
  await act(async () => { appStateListeners.forEach((cb) => cb(state)); });
};

// Let un-awaited notifee/expo-av promises settle under fake timers.
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 30; i++) {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await new Promise((r) => jest.requireActual('timers').setImmediate(r));
    }
  });
};

const advance = async (ms) => {
  await act(async () => { jest.advanceTimersByTime(ms); });
  await settle();
};

function renderTimer(overrides = {}) {
  const props = {
    sessionId: 1,
    currentExercise: { name: 'Bench Press' },
    currentSet: 2,
    totalSets: 3,
    currentExIdx: 0,
    totalExercises: 2,
    restDuration: 60,
    day: { day: 1, focus: 'Push' },
    completedExercises: new Set(),
    exerciseSets: {},
    ...overrides,
  };
  return renderHook((p) => useRestTimer(p), { initialProps: props });
}

describe('starting a rest', () => {
  test('shows the countdown, schedules the alarm and persists the end time', async () => {
    const { result } = renderTimer();
    await act(async () => { result.current.startRest('Bench Press', 60, null); });
    await settle();

    expect(result.current.isResting).toBe(true);
    expect(result.current.restRemaining).toBe(60);
    expect(notifeeState().displayed.has('rest-countdown')).toBe(true);
    expect(notifeeState().triggers.has('rest-alarm')).toBe(true);
    expect(mockTimerRow.rest_end_time).toBe(Date.now() + 60000);
  });

  test('counts down and fires the alarm and Begin Set modal at zero', async () => {
    const { result } = renderTimer();
    await act(async () => { result.current.startRest('Bench Press', 60, null); });
    await advance(30000);
    expect(result.current.restRemaining).toBe(30);

    await advance(30500);
    expect(result.current.isResting).toBe(false);
    expect(result.current.alarmFired).toBe(true);
    expect(avState().playingSounds()).toHaveLength(1);
    expect(mockTimerRow.alarm_fired_at).toEqual(expect.any(Number));
  });
});

describe('Begin Set', () => {
  test('silences the alarm, clears the persisted timer and runs the pending advance', async () => {
    const advanceFn = jest.fn();
    const { result } = renderTimer();
    await act(async () => { result.current.startRest('Bench Press', 10, advanceFn); });
    await advance(10500);
    expect(result.current.alarmFired).toBe(true);

    await act(async () => { result.current.handleBeginSet(); });
    await settle();

    expect(result.current.alarmFired).toBe(false);
    expect(avState().playingSounds()).toHaveLength(0);
    expect(mockTimerRow).toBeNull();
    expect(advanceFn).toHaveBeenCalledTimes(1);
  });

  test('Begin Set from the notification action works while the app is open', async () => {
    const { result } = renderTimer();
    await act(async () => { result.current.startRest('Bench Press', 10, null); });
    await advance(10500);
    const restId = mockTimerRow.rest_id;

    await act(async () => {
      notifeeState().emitForeground({ type: 2, detail: { pressAction: { id: 'begin-set' }, notification: { data: { restId: String(restId) } } } });
    });
    await settle();
    expect(result.current.alarmFired).toBe(false);
    expect(avState().playingSounds()).toHaveLength(0);
  });

  test('ignores notification actions from an older rest', async () => {
    const { result } = renderTimer();
    await act(async () => { result.current.startRest('Bench Press', 10, null); });
    await advance(10500);

    await act(async () => {
      notifeeState().emitForeground({ type: 2, detail: { pressAction: { id: 'begin-set' }, notification: { data: { restId: 'stale-rest' } } } });
    });
    await settle();
    expect(result.current.alarmFired).toBe(true);
  });

  // Review: "Begin Set leaves the in-app alarm still ringing."
  // On a lock-screen Begin Set the background handler clears the SQLite timer,
  // but the hook's in-memory end time survives. When the app comes back, the
  // 250ms countdown sees the old end time has passed and fires the alarm the
  // user has already dismissed.
  test.failing('a lock-screen Begin Set is not followed by the alarm when the app reopens', async () => {
    const { result } = renderTimer();
    await act(async () => { result.current.startRest('Bench Press', 60, null); });
    await settle();
    await setAppState('background');

    // Lock-screen Begin Set, handled by the background handler in _layout.js.
    mockTimerRow = null;
    await act(async () => { jest.setSystemTime(Date.now() + 61000); });

    await setAppState('active');
    await advance(500);

    expect(result.current.alarmFired).toBe(false);
    expect(avState().playingSounds()).toHaveLength(0);
  });
});

describe('+15 seconds', () => {
  test('restarts a 15s countdown and persists the new end time', async () => {
    const { result } = renderTimer();
    await act(async () => { result.current.startRest('Bench Press', 10, null); });
    await advance(10500);

    await act(async () => { result.current.handleExtendRest(); });
    await settle();

    expect(result.current.isResting).toBe(true);
    expect(result.current.restRemaining).toBe(15);
    expect(avState().playingSounds()).toHaveLength(0);
    expect(mockTimerRow.rest_end_time).toBe(Date.now() + 15000);
  });

  // Review: "+15s never re-arms the alarm." handleExtendRest calls cancelAll()
  // without awaiting and then schedules the new alarm, so cancelAll's trailing
  // cancelTriggerNotifications() wipes it. With the phone locked, nothing goes
  // off 15s later.
  test.failing('re-arms the lock-screen alarm for the extra 15 seconds', async () => {
    const { result } = renderTimer();
    await act(async () => { result.current.startRest('Bench Press', 10, null); });
    await advance(10500);

    await act(async () => { result.current.handleExtendRest(); });
    await settle();

    expect(notifeeState().triggers.has('rest-alarm')).toBe(true);
  });
});

describe('skip rest', () => {
  test('ends the rest immediately and runs the pending advance without an alarm', async () => {
    const advanceFn = jest.fn();
    const { result } = renderTimer();
    await act(async () => { result.current.startRest('Bench Press', 60, advanceFn); });
    await settle();

    await act(async () => { result.current.handleSkipRest(); });
    await settle();

    expect(result.current.isResting).toBe(false);
    expect(advanceFn).toHaveBeenCalledTimes(1);
    expect(mockTimerRow).toBeNull();
    expect(notifeeState().triggers.size).toBe(0);
    expect(avState().playingSounds()).toHaveLength(0);
  });
});

describe('recovery after the app was killed or backgrounded', () => {
  test('resumes a running countdown from SQLite and re-arms the alarm', async () => {
    mockTimerRow = { rest_end_time: Date.now() + 40000, exercise_name: 'Squat', rest_id: 555, alarm_fired_at: null };
    const { result } = renderTimer();
    await act(async () => { await result.current.recoverTimer(); });
    await settle();

    expect(result.current.isResting).toBe(true);
    expect(result.current.restRemaining).toBe(40);
    expect(notifeeState().triggers.get('rest-alarm').notification.data.restId).toBe('555');
  });

  test('shows Begin Set with the alarm when the rest ended while away', async () => {
    mockTimerRow = { rest_end_time: Date.now() - 5000, exercise_name: 'Squat', rest_id: 555, alarm_fired_at: null };
    const { result } = renderTimer();
    await act(async () => { await result.current.recoverTimer(); });
    await settle();

    expect(result.current.alarmFired).toBe(true);
    expect(avState().playingSounds()).toHaveLength(1);
    expect(mockTimerRow.alarm_fired_at).toEqual(expect.any(Number));
  });

  test('shows Begin Set silently when the alarm already went off over 2 minutes ago', async () => {
    mockTimerRow = { rest_end_time: Date.now() - 300000, exercise_name: 'Squat', rest_id: 555, alarm_fired_at: Date.now() - 280000 };
    const { result } = renderTimer();
    await act(async () => { await result.current.recoverTimer(); });
    await settle();

    expect(result.current.alarmFired).toBe(true);
    expect(avState().playingSounds()).toHaveLength(0);
  });

  test('repeated foreground events do not stack alarm sounds', async () => {
    mockTimerRow = { rest_end_time: Date.now() - 1000, exercise_name: 'Squat', rest_id: 555, alarm_fired_at: null };
    const { result } = renderTimer();
    await setAppState('active');
    await setAppState('active');
    await settle();
    expect(result.current.alarmFired).toBe(true);
    expect(avState().playingSounds()).toHaveLength(1);
  });

  test('saves workout position when the app is backgrounded', async () => {
    const { saveSessionState } = require('../../lib/database');
    renderTimer({ currentExIdx: 1, currentSet: 3, completedExercises: new Set([0]), exerciseSets: { 0: 3 } });
    await setAppState('background');
    expect(saveSessionState).toHaveBeenCalledWith(1, { day: 1, focus: 'Push' }, {
      currentExIdx: 1, currentSet: 3, completedExercises: [0], exerciseSets: { 0: 3 },
    });
  });

  test('unmounting cancels the countdown notification and alarm', async () => {
    const { result, unmount } = renderTimer();
    await act(async () => { result.current.startRest('Bench Press', 60, null); });
    await settle();
    unmount();
    await settle();
    expect(notifeeState().triggers.size).toBe(0);
    expect(notifeeState().displayed.size).toBe(0);
  });
});
