/**
 * lib/notifications — rest alarm scheduling and the in-app alarm sound.
 *
 * Tests marked `test.failing` reproduce bugs from the app review. They pass
 * today because the bug is present; when a fix lands Jest reports them as
 * failing, which is the cue to flip them to a plain `test`.
 */


function load(platform = 'ios') {
  jest.resetModules();
  const { Platform } = require('react-native');
  Platform.OS = platform;
  return require('../../lib/notifications');
}

const flush = async (times = 20) => {
  for (let i = 0; i < times; i++) await new Promise((r) => setImmediate(r));
};

beforeEach(() => {
  require('@notifee/react-native').__state.reset();
  require('expo-av').__state.reset();
  jest.clearAllMocks();
});

describe('scheduleAlarmNotification', () => {
  test('schedules the rest alarm and a safety net 60s later, tagged with the rest id', async () => {
    const lib = load();
    const before = Date.now();
    await lib.scheduleAlarmNotification(90, 1234);

    const triggers = require('@notifee/react-native').__state.triggers;
    const alarm = triggers.get('rest-alarm');
    const safety = triggers.get('rest-safety-net');
    expect(alarm).toBeDefined();
    expect(safety).toBeDefined();
    expect(alarm.notification.data.restId).toBe('1234');
    expect(alarm.trigger.timestamp).toBeGreaterThanOrEqual(before + 90000);
    expect(safety.trigger.timestamp - alarm.trigger.timestamp).toBe(60000);
  });

  test('alarm offers Begin Set and +15s actions on Android', async () => {
    const lib = load('android');
    await lib.scheduleAlarmNotification(30, 1);
    const alarm = require('@notifee/react-native').__state.triggers.get('rest-alarm');
    const ids = alarm.notification.android.actions.map((a) => a.pressAction.id);
    expect(ids).toEqual([lib.ACTION_BEGIN_SET, lib.ACTION_EXTEND_15S]);
  });

  test('swallows native errors instead of crashing the workout screen', async () => {
    const lib = load();
    const notifee = require('@notifee/react-native').default;
    notifee.createTriggerNotification.mockRejectedValueOnce(new Error('bridge down'));
    await expect(lib.scheduleAlarmNotification(30, 1)).resolves.toBeUndefined();
  });
});

describe('fireAlarmNow', () => {
  test('cancels the scheduled alarm and safety net so they do not fire a second time', async () => {
    const lib = load();
    await lib.scheduleAlarmNotification(60, 7);
    await lib.fireAlarmNow(7);

    const { triggers, displayed } = require('@notifee/react-native').__state;
    expect(triggers.has('rest-safety-net')).toBe(false);
    expect(triggers.has('rest-alarm')).toBe(false);
    expect(displayed.has('rest-alarm')).toBe(true);
    expect(displayed.has('rest-countdown')).toBe(false);
  });

  test('plays a looping alarm sound by default, and none when playSound is false', async () => {
    const lib = load();
    await lib.fireAlarmNow(1);
    expect(require('expo-av').__state.playingSounds()).toHaveLength(1);

    await lib.stopAlarm();
    await lib.fireAlarmNow(2, { playSound: false });
    expect(require('expo-av').__state.playingSounds()).toHaveLength(0);
  });

  test('firing twice does not leave two sounds playing', async () => {
    const lib = load();
    await lib.fireAlarmNow(1);
    await lib.fireAlarmNow(1);
    expect(require('expo-av').__state.playingSounds()).toHaveLength(1);
  });
});

describe('stopAlarm', () => {
  test('stops the sound and dismisses the alarm notification', async () => {
    const lib = load();
    await lib.fireAlarmNow(1);
    await lib.stopAlarm();
    expect(require('expo-av').__state.playingSounds()).toHaveLength(0);
    expect(require('@notifee/react-native').__state.displayed.has('rest-alarm')).toBe(false);
  });

  // Review: "Begin Set leaves the in-app alarm still ringing."
  // fireAlarmNow awaits several notifee calls and then loads the sound. If
  // Begin Set (stopAlarm) lands while the sound is still loading, stopAlarm
  // sees no sound to stop, and the looping sound starts afterwards.
  test.failing('Begin Set during alarm start-up still silences the alarm', async () => {
    const lib = load();
    require('expo-av').__state.holdLoads(true);

    const firing = lib.fireAlarmNow(1);
    await flush();
    await lib.stopAlarm();
    require('expo-av').__state.finishLoads();
    await firing;
    await flush();

    expect(require('expo-av').__state.playingSounds()).toHaveLength(0);
  });
});

describe('cancelAll', () => {
  test('clears displayed notifications, scheduled triggers and the sound', async () => {
    const lib = load('android');
    await lib.showTimerNotification('Bench', 60, 1);
    await lib.scheduleAlarmNotification(60, 1);
    await lib.fireAlarmNow(1);
    await lib.cancelAll();

    const { triggers, displayed } = require('@notifee/react-native').__state;
    expect(triggers.size).toBe(0);
    expect(displayed.size).toBe(0);
    expect(require('expo-av').__state.playingSounds()).toHaveLength(0);
    expect(require('@notifee/react-native').default.stopForegroundService).toHaveBeenCalled();
  });

  // Review: "+15s never re-arms the alarm." handleExtendRest calls cancelAll()
  // without awaiting it and then schedules the new alarm. cancelAll finishes
  // with cancelTriggerNotifications(), which runs after the new alarm has been
  // scheduled and wipes it.
  test.failing('an alarm scheduled right after an un-awaited cancelAll survives', async () => {
    const lib = load();
    lib.cancelAll();
    lib.scheduleAlarmNotification(15, 99);
    await flush();
    expect(require('@notifee/react-native').__state.triggers.has('rest-alarm')).toBe(true);
  });
});

describe('initNotifications', () => {
  test('creates the timer and alarm channels on Android', async () => {
    const lib = load('android');
    await lib.initNotifications();
    const notifee = require('@notifee/react-native').default;
    const ids = notifee.createChannel.mock.calls.map(([c]) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['rest-timer', 'rest-alarm']));
  });

  test('registers Begin Set / +15s actions as an iOS category', async () => {
    const lib = load('ios');
    await lib.initNotifications();
    const notifee = require('@notifee/react-native').default;
    const [categories] = notifee.setNotificationCategories.mock.calls[0];
    const restAlarm = categories.find((c) => c.id === 'rest-alarm');
    expect(restAlarm.actions.map((a) => a.id)).toEqual([lib.ACTION_BEGIN_SET, lib.ACTION_EXTEND_15S]);
  });
});
