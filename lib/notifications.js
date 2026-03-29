import { Platform } from 'react-native';

// Lazy-load expo-notifications (not available in Expo Go SDK 53+)
let Notifications = null;
try {
  Notifications = require('expo-notifications');
} catch {}

// Lazy-load expo-av for foreground alarm playback
let Audio = null;
try {
  Audio = require('expo-av').Audio;
} catch {}

const TIMER_NOTIF_ID = 'rest-timer-ongoing';
const ALARM_NOTIF_ID = 'rest-timer-alarm';

let alarmSound = null;

/**
 * Initialize notification handler, permissions, and Android channels.
 * Call once from _layout.js on app mount.
 */
export async function initNotifications() {
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  await Notifications.requestPermissionsAsync();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('rest-timer', {
      name: 'Rest Timer',
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: [0],
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync('rest-alarm', {
      name: 'Rest Timer Alarm',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'alarm.wav',
      vibrationPattern: [0, 250, 250, 250, 250, 250],
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

/**
 * Show a persistent notification while the rest timer is running.
 */
export async function showTimerNotification(exerciseName, totalSeconds) {
  if (!Notifications) return;
  try {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    await Notifications.scheduleNotificationAsync({
      identifier: TIMER_NOTIF_ID,
      content: {
        title: 'Rest Timer',
        body: `${exerciseName} \u2014 Resting for ${timeStr}`,
        sticky: true,
        autoDismiss: false,
        sound: false,
      },
      trigger: Platform.OS === 'android'
        ? { channelId: 'rest-timer' }
        : null,
    });
  } catch {}
}

/**
 * Schedule the alarm notification to fire when rest ends.
 * Covers the background case (app not in foreground).
 */
export async function scheduleAlarmNotification(seconds) {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: ALARM_NOTIF_ID,
      content: {
        title: 'Rest Complete!',
        body: 'Time to hit your next set!',
        sound: 'alarm.wav',
        vibrate: [0, 500, 200, 500, 200, 500],
        priority: 'max',
        color: '#d4ff00',
      },
      trigger: {
        type: 'timeInterval',
        seconds,
        repeats: false,
        ...(Platform.OS === 'android' ? { channelId: 'rest-alarm' } : {}),
      },
    });
  } catch {}
}

/**
 * Fire the alarm immediately (foreground completion).
 * Cancels the scheduled alarm, dismisses the timer notification,
 * shows the alarm notification, and plays the alarm sound.
 */
export async function fireAlarmNow() {
  if (!Notifications) return;
  try {
    // Cancel the scheduled background alarm (prevent double-fire)
    await Notifications.cancelScheduledNotificationAsync(ALARM_NOTIF_ID).catch(() => {});
    // Dismiss the persistent timer notification
    await Notifications.dismissNotificationAsync(TIMER_NOTIF_ID).catch(() => {});

    // Show alarm notification immediately
    await Notifications.scheduleNotificationAsync({
      identifier: ALARM_NOTIF_ID,
      content: {
        title: 'Rest Complete!',
        body: 'Time to hit your next set!',
        sound: 'alarm.wav',
        vibrate: [0, 500, 200, 500, 200, 500],
        priority: 'max',
        color: '#d4ff00',
      },
      trigger: Platform.OS === 'android'
        ? { channelId: 'rest-alarm' }
        : null,
    });
  } catch {}

  // Play alarm sound via expo-av at full volume
  await playAlarmSound();
}

/**
 * Play the alarm sound in-app (louder, looping, controllable).
 */
async function playAlarmSound() {
  if (!Audio) return;
  try {
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

    // Auto-stop after 8 seconds
    setTimeout(() => stopAlarm(), 8000);
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
  if (Notifications) {
    try {
      await Notifications.dismissNotificationAsync(ALARM_NOTIF_ID);
    } catch {}
  }
}

/**
 * Cancel everything: both notifications, scheduled alarm, and sound.
 */
export async function cancelAll() {
  await stopAlarm();
  if (!Notifications) return;
  try { await Notifications.dismissNotificationAsync(TIMER_NOTIF_ID); } catch {}
  try { await Notifications.cancelScheduledNotificationAsync(TIMER_NOTIF_ID); } catch {}
  try { await Notifications.cancelScheduledNotificationAsync(ALARM_NOTIF_ID); } catch {}
}
