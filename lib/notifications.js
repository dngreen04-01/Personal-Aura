import { Platform } from 'react-native';
import notifee, { AndroidImportance, AndroidVisibility, TriggerType, EventType } from '@notifee/react-native';

// Lazy-load expo-notifications for permission requests only
let Notifications = null;
try {
  Notifications = require('expo-notifications');
} catch {}

// Lazy-load expo-av for foreground alarm playback
let Audio = null;
try {
  Audio = require('expo-av').Audio;
} catch {}

const TIMER_NOTIF_ID = 'rest-countdown';
const ALARM_NOTIF_ID = 'rest-alarm';
const SAFETY_NET_NOTIF_ID = 'rest-safety-net';

let alarmSound = null;

// Notifee action identifiers
export const ACTION_BEGIN_SET = 'begin-set';
export const ACTION_EXTEND_15S = 'extend-15s';

/**
 * Initialize notification permissions and Android channels.
 * Call once from _layout.js on app mount.
 */
export async function initNotifications() {
  // Request permissions via expo-notifications (handles iOS permission dialog)
  if (Notifications) {
    try { await Notifications.requestPermissionsAsync(); } catch {}
  }

  // Create iOS notification categories with action buttons
  if (Platform.OS === 'ios') {
    await notifee.setNotificationCategories([
      {
        id: 'rest-alarm',
        actions: [
          { id: ACTION_BEGIN_SET, title: 'Begin Set' },
          { id: ACTION_EXTEND_15S, title: '+15s' },
        ],
      },
    ]);
  }

  // Create Notifee Android channels
  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: 'rest-timer',
      name: 'Rest Timer',
      importance: AndroidImportance.LOW,
      vibration: false,
      visibility: AndroidVisibility.PUBLIC,
    });

    await notifee.createChannel({
      id: 'rest-alarm',
      name: 'Rest Timer Alarm',
      importance: AndroidImportance.HIGH,
      sound: 'alarm',
      vibration: true,
      vibrationPattern: [0, 250, 250, 250, 250, 250],
      visibility: AndroidVisibility.PUBLIC,
    });
  }
}

/**
 * Show a persistent countdown notification while the rest timer is running.
 * Android: native chronometer countdown. iOS: static time display.
 */
export async function showTimerNotification(exerciseName, totalSeconds, restId) {
  try {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    const restEndTimestamp = Date.now() + totalSeconds * 1000;

    await notifee.displayNotification({
      id: TIMER_NOTIF_ID,
      title: 'Rest Timer',
      body: `${exerciseName} \u2014 Resting for ${timeStr}`,
      data: { restId: String(restId || '') },
      android: {
        channelId: 'rest-timer',
        ongoing: true,
        autoCancel: false,
        showChronometer: true,
        chronometerDirection: 'down',
        timestamp: restEndTimestamp,
        smallIcon: 'ic_notification',
        color: '#d4ff00',
        pressAction: { id: 'default' },
      },
      ios: {
        sound: undefined,
      },
    });
  } catch {}
}

/**
 * Schedule the alarm notification to fire when rest ends.
 * Also schedules a 60-second safety net re-fire.
 */
export async function scheduleAlarmNotification(seconds, restId) {
  try {
    const alarmTime = Date.now() + seconds * 1000;

    // Schedule alarm at rest end
    await notifee.createTriggerNotification(
      {
        id: ALARM_NOTIF_ID,
        title: 'Rest Complete!',
        body: 'Time to hit your next set!',
        data: { restId: String(restId || '') },
        android: {
          channelId: 'rest-alarm',
          pressAction: { id: 'default' },
          actions: [
            { title: 'Begin Set', pressAction: { id: ACTION_BEGIN_SET } },
            { title: '+15s', pressAction: { id: ACTION_EXTEND_15S } },
          ],
          color: '#d4ff00',
          smallIcon: 'ic_notification',
        },
        ios: {
          sound: 'alarm.wav',
          categoryId: 'rest-alarm',
        },
      },
      { type: TriggerType.TIMESTAMP, timestamp: alarmTime },
    );

    // Schedule 60-second safety net re-fire
    await notifee.createTriggerNotification(
      {
        id: SAFETY_NET_NOTIF_ID,
        title: 'Rest Complete!',
        body: 'Time to hit your next set!',
        data: { restId: String(restId || '') },
        android: {
          channelId: 'rest-alarm',
          pressAction: { id: 'default' },
          actions: [
            { title: 'Begin Set', pressAction: { id: ACTION_BEGIN_SET } },
            { title: '+15s', pressAction: { id: ACTION_EXTEND_15S } },
          ],
          color: '#d4ff00',
          smallIcon: 'ic_notification',
        },
        ios: {
          sound: 'alarm.wav',
          categoryId: 'rest-alarm',
        },
      },
      { type: TriggerType.TIMESTAMP, timestamp: alarmTime + 60000 },
    );
  } catch {}
}

/**
 * Fire the alarm immediately (foreground completion).
 * Cancels the scheduled alarm, dismisses the timer notification,
 * shows the alarm notification, and plays the alarm sound.
 */
export async function fireAlarmNow(restId) {
  try {
    // Cancel scheduled background alarm + safety net (prevent double-fire)
    await notifee.cancelNotification(ALARM_NOTIF_ID).catch(() => {});
    await notifee.cancelNotification(SAFETY_NET_NOTIF_ID).catch(() => {});
    // Dismiss the persistent timer notification
    await notifee.cancelNotification(TIMER_NOTIF_ID).catch(() => {});

    // Show alarm notification immediately with action buttons
    await notifee.displayNotification({
      id: ALARM_NOTIF_ID,
      title: 'Rest Complete!',
      body: 'Time to hit your next set!',
      data: { restId: String(restId || '') },
      android: {
        channelId: 'rest-alarm',
        pressAction: { id: 'default' },
        actions: [
          { title: 'Begin Set', pressAction: { id: ACTION_BEGIN_SET } },
          { title: '+15s', pressAction: { id: ACTION_EXTEND_15S } },
        ],
        color: '#d4ff00',
        smallIcon: 'ic_notification',
      },
      ios: {
        sound: 'alarm.wav',
      },
    });
  } catch {}

  // Play alarm sound via expo-av at full volume (foreground only)
  await playAlarmSound();
}

/**
 * Play the alarm sound in-app (louder, looping, controllable).
 * Caller is responsible for stopping via stopAlarm().
 */
async function playAlarmSound() {
  if (!Audio) return;
  try {
    // Unload previous sound if still playing (prevents resource leak)
    if (alarmSound) {
      try { await alarmSound.stopAsync(); await alarmSound.unloadAsync(); } catch {}
      alarmSound = null;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      require('../assets/sounds/alarm.wav'),
      { shouldPlay: true, isLooping: true, volume: 1.0 }
    );
    alarmSound = sound;
  } catch {}
}

/**
 * Stop the in-app alarm sound and dismiss the alarm notification.
 */
export async function stopAlarm() {
  if (alarmSound) {
    try {
      await alarmSound.stopAsync();
      await alarmSound.unloadAsync();
    } catch {}
    alarmSound = null;
  }
  try {
    await notifee.cancelNotification(ALARM_NOTIF_ID);
  } catch {}
}

/**
 * Cancel everything: all notifications, scheduled triggers, and sound.
 */
export async function cancelAll() {
  await stopAlarm();
  try { await notifee.cancelNotification(TIMER_NOTIF_ID); } catch {}
  try { await notifee.cancelNotification(ALARM_NOTIF_ID); } catch {}
  try { await notifee.cancelNotification(SAFETY_NET_NOTIF_ID); } catch {}
  // Cancel any remaining trigger notifications
  try { await notifee.cancelTriggerNotifications(); } catch {}
}

// Re-export Notifee event types for use in workout.js and _layout.js
export { notifee, EventType };
