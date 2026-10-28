/**
 * app/workout.js — the active workout screen: logging sets, the rest overlay,
 * the Begin Set modal and leaving a workout.
 *
 * The screen, its hooks, the exercise card, rest sheet and transition modal
 * render for real. lib/database is replaced with an in-memory recorder, and
 * lib/notifications runs against the fake notifee from setup.js.
 *
 * `test.failing` marks review bugs that are still present (see
 * notifications.test.js for the convention).
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn() };
let mockParams = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { MaterialIcons: ({ name }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('@react-native-community/slider', () => () => null);
jest.mock('../../components/AuraOrb', () => () => null);
jest.mock('../../components/ExerciseDetail', () => () => null);
jest.mock('../../components/workout/BlockRouter', () => () => null);
jest.mock('../../components/ExerciseHub', () => {
  const { Text } = require('react-native');
  return ({ visible }) => (visible ? <Text>EXERCISE HUB</Text> : null);
});
jest.mock('../../lib/api', () => ({
  sendAgentMessage: jest.fn(),
  generateExerciseImage: jest.fn(),
  generateWorkoutCard: jest.fn(),
}));

let mockTimerRow = null;
jest.mock('../../lib/database', () => ({
  // session lifecycle
  startSession: jest.fn(async () => 101),
  endSession: jest.fn(async () => {}),
  getSessionState: jest.fn(async () => null),
  saveSessionState: jest.fn(async () => {}),
  getUserProfile: jest.fn(async () => ({ goal: 'strength', equipment: 'full_gym' })),
  createSessionBlock: jest.fn(async (sid, idx) => 1000 + idx),
  getSessionBlocks: jest.fn(async () => []),
  createBlocksFromPlan: jest.fn(async () => []),
  getSessionStats: jest.fn(async () => null),
  // set logging
  logStrengthSet: jest.fn(async () => 1),
  setExerciseUnitPreference: jest.fn(async () => {}),
  getTrainingContext: jest.fn(async () => null),
  // per-exercise state
  getExerciseUnitPreference: jest.fn(async () => 'kg'),
  getExerciseMaxWeight: jest.fn(async () => null),
  getWorkoutStreak: jest.fn(async () => ({ current: 0, longest: 0 })),
  getCompletedSessionCount: jest.fn(async () => 0),
  getExerciseProgressionData: jest.fn(async () => null),
  getCachedExercisesByNames: jest.fn(async () => []),
  // rest timer
  saveRestTimer: jest.fn(async (restEndTime, sessionId, exerciseName, setNumber, totalSets, exerciseIndex, totalExercises, restId) => {
    mockTimerRow = { rest_end_time: restEndTime, session_id: sessionId, exercise_name: exerciseName, set_number: setNumber, rest_id: restId, alarm_fired_at: null };
  }),
  getActiveRestTimer: jest.fn(async () => mockTimerRow),
  clearRestTimer: jest.fn(async () => { mockTimerRow = null; }),
  markRestTimerAlarmFired: jest.fn(async () => {}),
}));

const db = require('../../lib/database');
const WorkoutScreen = require('../../app/workout').default;

const DAY = {
  day: 1,
  focus: 'Push Day',
  exercises: [
    { name: 'Bench Press', sets: '3', reps: '8', restSeconds: '60', targetWeight: '60' },
    { name: 'Overhead Press', sets: '2', reps: '10', restSeconds: '60', targetWeight: '30' },
  ],
};

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

async function renderWorkout(day = DAY) {
  mockParams = { dayJson: JSON.stringify(day) };
  render(<WorkoutScreen />);
  await settle();
}

const logSet = async (n) => {
  fireEvent.press(screen.getByText(`Log set ${n}`));
  await settle();
};
const finishRest = async (seconds = 60) => {
  await advance(seconds * 1000 + 500);
};
const beginSet = async () => {
  fireEvent.press(screen.getByLabelText('BEGIN SET'));
  await settle();
};
// The modal's primary button, whatever it is labelled. Used where the label
// itself is not under test (it is wrong after the second-to-last set).
const pressModalPrimary = async () => {
  fireEvent.press(screen.getByLabelText(/^(BEGIN SET|NEXT EXERCISE|FINISH)$/));
  await settle();
};

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-28T08:00:00Z') });
  jest.clearAllMocks();
  mockTimerRow = null;
  require('@notifee/react-native').__state.reset();
  require('expo-av').__state.reset();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('logging sets', () => {
  test('starts a session for the day and shows the first exercise', async () => {
    await renderWorkout();
    expect(db.startSession).toHaveBeenCalledWith(1, 'Push Day', null, expect.anything());
    expect(screen.getByText('Log set 1')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
  });

  test('logging a set writes it to the session and starts the rest timer', async () => {
    await renderWorkout();
    await logSet(1);

    expect(db.logStrengthSet).toHaveBeenCalledTimes(1);
    expect(db.logStrengthSet).toHaveBeenCalledWith(101, 1000, 'Bench Press', 1, 60, 'kg', 8, null, 60);
    expect(screen.getByText('RESTING')).toBeTruthy();
    expect(mockTimerRow).toMatchObject({ session_id: 101, exercise_name: 'Bench Press' });
  });

  test('Begin Set after the rest moves on to the next set', async () => {
    await renderWorkout();
    await logSet(1);
    await finishRest();
    expect(screen.getByText('REST COMPLETE')).toBeTruthy();

    await beginSet();
    expect(screen.queryByText('REST COMPLETE')).toBeNull();
    expect(screen.getByText('Log set 2')).toBeTruthy();
  });

  // Review: "Sets can be logged twice." Nothing guards handleDone, so a
  // double tap writes two rows for the same set.
  test.failing('a double tap on Log set records the set once', async () => {
    await renderWorkout();
    const button = screen.getByText('Log set 1');
    fireEvent.press(button);
    fireEvent.press(button);
    await settle();
    expect(db.logStrengthSet).toHaveBeenCalledTimes(1);
  });

  // Review: "The Log set button stays live behind the last rest." The card
  // stays mounted and pressable under the rest overlay.
  test.failing('Log set cannot be pressed while resting', async () => {
    await renderWorkout();
    await logSet(1);
    expect(screen.getByText('RESTING')).toBeTruthy();

    const live = screen.queryByText(/^Log set \d$/);
    if (live) fireEvent.press(live);
    await settle();
    expect(db.logStrengthSet).toHaveBeenCalledTimes(1);
  });
});

describe('the Begin Set modal', () => {
  test('after the final set of an exercise it says ALL SETS COMPLETE and opens the exercise hub', async () => {
    await renderWorkout();
    for (let set = 1; set <= 3; set++) {
      await logSet(set);
      await finishRest();
      if (set < 3) await pressModalPrimary();
    }
    expect(screen.getByText('ALL SETS COMPLETE')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('NEXT EXERCISE'));
    await settle();
    expect(screen.getByText('EXERCISE HUB')).toBeTruthy();
  });

  // Review: "After the second-to-last set, the alarm says ALL SETS COMPLETE."
  // handleDone bumps currentSet before the rest, and the modal variant is
  // worked out from the bumped value, so set 2 of 3 is labelled as the end.
  test.failing('after the second-to-last set it still says REST COMPLETE', async () => {
    await renderWorkout();
    await logSet(1);
    await finishRest();
    await beginSet();
    await logSet(2);
    await finishRest();

    expect(screen.queryByText('ALL SETS COMPLETE')).toBeNull();
    expect(screen.getByText('REST COMPLETE')).toBeTruthy();
  });

  test('finishing every set of every exercise ends the session and opens the summary', async () => {
    const shortDay = { ...DAY, exercises: [{ name: 'Bench Press', sets: '1', reps: '8', restSeconds: '30', targetWeight: '60' }] };
    await renderWorkout(shortDay);
    await logSet(1);
    await finishRest(30);
    expect(screen.getByText('WORKOUT COMPLETE')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('FINISH'));
    await settle();
    expect(db.endSession).toHaveBeenCalledWith(101);
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/workout-complete',
      params: { sessionId: 101, focus: 'Push Day' },
    });
  });

  test('Begin Set stops the alarm sound', async () => {
    await renderWorkout();
    await logSet(1);
    await finishRest();
    expect(require('expo-av').__state.playingSounds()).toHaveLength(1);

    await beginSet();
    expect(require('expo-av').__state.playingSounds()).toHaveLength(0);
  });
});

describe('leaving a workout', () => {
  // Review: "Tapping X ends the workout without asking and counts it as
  // completed." handleClose calls endSession straight away, which stamps
  // ended_at, so the abandoned session counts toward streaks and totals.
  test.failing('tapping X asks before ending the workout', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderWorkout();
    await logSet(1);

    fireEvent.press(screen.getByText('icon:close'));
    await settle();

    expect(alertSpy).toHaveBeenCalled();
    expect(db.endSession).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('tapping X leaves the screen', async () => {
    await renderWorkout();
    fireEvent.press(screen.getByText('icon:close'));
    await settle();
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('bad input', () => {
  test('shows a message instead of crashing when the day is missing or malformed', async () => {
    mockParams = { dayJson: '{not json' };
    render(<WorkoutScreen />);
    await settle();
    expect(screen.getByText('No workout data')).toBeTruthy();
  });
});
