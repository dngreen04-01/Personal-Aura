/**
 * app/_layout.js registers notifee's background handler at module load. It
 * runs when the user taps Begin Set or +15s on the lock screen, often after
 * the app has been killed, so it must work from SQLite alone.
 *
 * `test.failing` marks review bugs that are still present (see
 * notifications.test.js for the convention).
 */
let mockTimerRow = null;
let mockPersistedUid = 'user-1';

jest.mock('../../lib/database', () => ({
  getPersistedUid: jest.fn(async () => mockPersistedUid),
  getDatabase: jest.fn(async () => ({})),
  getActiveRestTimer: jest.fn(async () => mockTimerRow),
  clearRestTimer: jest.fn(async () => { mockTimerRow = null; }),
  saveRestTimer: jest.fn(async (restEndTime, sessionId, exerciseName, setNumber, totalSets, exerciseIndex, totalExercises, restId) => {
    mockTimerRow = { rest_end_time: restEndTime, session_id: sessionId, exercise_name: exerciseName, set_number: setNumber, total_sets: totalSets, exercise_index: exerciseIndex, total_exercises: totalExercises, rest_id: restId };
  }),
}));
jest.mock('../../lib/authContext', () => ({ AuthProvider: ({ children }) => children }));
jest.mock('../../lib/auth', () => ({ configureGoogleSignIn: jest.fn() }));
jest.mock('expo-router', () => ({ Stack: () => null }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock('@expo-google-fonts/inter', () => ({ useFonts: () => [true] }));

const notifeeState = () => require('@notifee/react-native').__state;
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

const press = (id, restId = '42') => notifeeState().emitBackground({
  type: 2, // EventType.ACTION_PRESS
  detail: { pressAction: { id }, notification: { data: { restId } } },
});

beforeEach(async () => {
  notifeeState().reset();
  mockPersistedUid = 'user-1';
  mockTimerRow = {
    rest_end_time: Date.now() - 1000, session_id: 3, exercise_name: 'Deadlift',
    set_number: 2, total_sets: 3, exercise_index: 1, total_exercises: 4, rest_id: 42,
  };
  jest.isolateModules(() => { require('../../app/_layout'); });
  // Pretend the alarm and its safety net are showing / scheduled.
  const notifee = require('@notifee/react-native').default;
  await require('../../lib/notifications').scheduleAlarmNotification(0, 42);
  await notifee.displayNotification({ id: 'rest-alarm', title: 'Rest Complete!' });
});

test('registers a background handler and an Android foreground service at load', () => {
  const notifee = require('@notifee/react-native').default;
  expect(notifee.onBackgroundEvent).toHaveBeenCalled();
  expect(notifee.registerForegroundService).toHaveBeenCalled();
});

test('Begin Set dismisses the alarm and safety net and clears the timer', async () => {
  await press('begin-set');
  await flush();
  const { displayed, triggers } = notifeeState();
  expect(displayed.has('rest-alarm')).toBe(false);
  expect(triggers.has('rest-safety-net')).toBe(false);
  expect(mockTimerRow).toBeNull();
});

test('Begin Set still silences the alarm when the user id was never persisted', async () => {
  mockPersistedUid = null;
  await press('begin-set');
  await flush();
  expect(notifeeState().displayed.has('rest-alarm')).toBe(false);
  expect(notifeeState().triggers.has('rest-safety-net')).toBe(false);
});

test('+15s pushes the persisted end time 15 seconds out, keeping the rest context', async () => {
  const before = Date.now();
  await press('extend-15s');
  await flush();
  expect(mockTimerRow.rest_end_time).toBeGreaterThanOrEqual(before + 15000);
  expect(mockTimerRow).toMatchObject({ session_id: 3, exercise_name: 'Deadlift', set_number: 2, rest_id: 42 });
});

// Review: "+15s never re-arms the alarm." The background handler only moves
// the end time in SQLite. Nothing schedules a new alarm, so if the phone stays
// locked the user is never told the extra 15 seconds are up.
test.failing('+15s schedules a new alarm for 15 seconds later', async () => {
  const before = Date.now();
  await press('extend-15s');
  await flush();
  const alarm = notifeeState().triggers.get('rest-alarm');
  expect(alarm).toBeDefined();
  expect(alarm.trigger.timestamp).toBeGreaterThanOrEqual(before + 15000);
});

test('ignores plain notification taps (the app opens and recovers on its own)', async () => {
  await notifeeState().emitBackground({ type: 1, detail: { notification: { id: 'rest-alarm' } } });
  await flush();
  expect(notifeeState().displayed.has('rest-alarm')).toBe(true);
  expect(mockTimerRow).not.toBeNull();
});
