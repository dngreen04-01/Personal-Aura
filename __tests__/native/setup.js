/**
 * Shared native-module mocks for the screens project (jest-expo preset).
 * Anything that would call into a native module at import time is stubbed
 * here so screens and hooks can render under the test renderer.
 */
// jest-expo installs lazy "winter" globals that load modules on first access,
// which Jest 30 rejects once the test file is running. Resolve them up front.
Object.defineProperty(global, '__ExpoImportMetaRegistry', {
  value: { url: null }, configurable: true, writable: true,
});
Object.defineProperty(global, 'structuredClone', {
  value: (v) => JSON.parse(JSON.stringify(v)), configurable: true, writable: true,
});

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@notifee/react-native', () => require('./__helpers__/fakeNotifee'));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('expo-av', () => require('./__helpers__/fakeExpoAv'));

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));
