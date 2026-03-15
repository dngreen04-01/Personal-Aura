const { getUserProfile } = require('./firestore');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPushNotification(uid, { title, body, data = {} }) {
  const profile = await getUserProfile(uid);
  const pushToken = profile?.pushToken;

  if (!pushToken) {
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'No push token for user, skipping notification',
      uid,
    }));
    return { sent: false, reason: 'no_token' };
  }

  const message = {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data,
  };

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  const result = await response.json();

  // Handle DeviceNotRegistered — clear stale token
  if (result.data?.status === 'error' && result.data?.details?.error === 'DeviceNotRegistered') {
    console.log(JSON.stringify({
      severity: 'WARNING',
      message: 'Push token invalid, clearing from profile',
      uid,
    }));
    const { updateUserProfile } = require('./firestore');
    const admin = require('firebase-admin');
    await updateUserProfile(uid, { pushToken: admin.firestore.FieldValue.delete() });
    return { sent: false, reason: 'device_not_registered' };
  }

  return { sent: true, result };
}

async function sendBatchNotifications(notifications) {
  // Expo allows up to 100 messages per request
  const results = [];

  for (let i = 0; i < notifications.length; i += 100) {
    const chunk = notifications.slice(i, i + 100);

    // Build messages, filtering out users without tokens
    const messages = [];
    for (const notif of chunk) {
      const profile = await getUserProfile(notif.uid);
      if (!profile?.pushToken) continue;

      messages.push({
        to: profile.pushToken,
        sound: 'default',
        title: notif.title,
        body: notif.body,
        data: notif.data || {},
      });
    }

    if (messages.length === 0) continue;

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    results.push(result);
  }

  return results;
}

module.exports = { sendPushNotification, sendBatchNotifications };
