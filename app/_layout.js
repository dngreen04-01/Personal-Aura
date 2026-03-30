import { useEffect, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '../lib/theme';
import { AuthProvider } from '../lib/authContext';
import { initNotifications, notifee, EventType, ACTION_BEGIN_SET, ACTION_EXTEND_15S } from '../lib/notifications';
import { clearRestTimer, saveRestTimer, getActiveRestTimer } from '../lib/database';
import { configureGoogleSignIn } from '../lib/auth';

SplashScreen.preventAutoHideAsync();

// Register Notifee background event handler (must be at module level)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.ACTION_PRESS) return;
  const actionId = detail?.pressAction?.id;

  if (actionId === ACTION_BEGIN_SET) {
    await clearRestTimer().catch(() => {});
    await notifee.cancelNotification('rest-alarm').catch(() => {});
    await notifee.cancelNotification('rest-safety-net').catch(() => {});
    await notifee.cancelNotification('rest-countdown').catch(() => {});
  } else if (actionId === ACTION_EXTEND_15S) {
    // Extend timer in SQLite so workout.js picks it up on foreground
    try {
      const saved = await getActiveRestTimer();
      if (saved) {
        const newEndTime = Date.now() + 15000;
        await saveRestTimer(newEndTime, saved.session_id, saved.exercise_name, saved.set_number, saved.total_sets, saved.exercise_index, saved.total_exercises, saved.rest_id);
      }
    } catch {}
    await notifee.cancelNotification('rest-alarm').catch(() => {});
    await notifee.cancelNotification('rest-safety-net').catch(() => {});
    await notifee.cancelNotification('rest-countdown').catch(() => {});
  }
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    configureGoogleSignIn();
    initNotifications();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgDark, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <View style={{ flex: 1, backgroundColor: colors.bgDark }} onLayout={onLayoutRootView}>
        <StatusBar style="light" backgroundColor={colors.bgDark} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bgDark },
            animation: 'slide_from_right',
          }}
        />
      </View>
    </AuthProvider>
  );
}
