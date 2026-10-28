/**
 * Sign-in on a new device: lib/authContext starts sync, and app/index.js
 * decides between onboarding and the main tabs from the local database.
 *
 * `test.failing` marks review bugs that are still present (see
 * notifications.test.js for the convention).
 */
import { render, act } from '@testing-library/react-native';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, cb) => { cb({ uid: 'returning-user' }); return () => {}; }),
}));
jest.mock('../../lib/firebase', () => ({ auth: {} }));

// The local database starts empty; restore fills in the profile.
let mockLocalProfile = false;
jest.mock('../../lib/database', () => ({
  getDatabase: jest.fn(async () => ({})),
  closeDatabase: jest.fn(async () => {}),
  persistActiveUid: jest.fn(async () => {}),
  getFailedSyncCount: jest.fn(async () => 0),
  hasCompletedOnboarding: jest.fn(async () => mockLocalProfile),
  getIncompleteSession: jest.fn(async () => null),
  discardSession: jest.fn(async () => {}),
}));

// Restore takes a moment on a real network: profile lands after 2 seconds.
jest.mock('../../lib/sync', () => ({
  initializeSync: jest.fn(() => new Promise((resolve) => {
    setTimeout(() => { mockLocalProfile = true; resolve(() => {}); }, 2000);
  })),
  teardownSync: jest.fn(),
}));

const { AuthProvider } = require('../../lib/authContext');
const Index = require('../../app/index').default;

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await new Promise((r) => jest.requireActual('timers').setImmediate(r));
    }
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockLocalProfile = false;
  mockRouter.replace.mockClear();
});
afterEach(() => jest.useRealTimers());

const renderApp = () => render(<AuthProvider><Index /></AuthProvider>);

test('a user whose profile is already on this device goes straight to the tabs', async () => {
  mockLocalProfile = true;
  renderApp();
  await settle();
  expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
});

test('a brand new user with no cloud data is sent to onboarding', async () => {
  const sync = require('../../lib/sync');
  sync.initializeSync.mockImplementationOnce(async () => () => {});
  renderApp();
  await settle();
  await act(async () => { jest.advanceTimersByTime(3000); });
  await settle();
  expect(mockRouter.replace).toHaveBeenCalledWith('/onboarding');
});

// Review: "A returning user is sent back to onboarding." authContext starts
// sync without waiting for it and immediately reports the user as signed in.
// index.js then checks the still-empty local database and routes to
// onboarding before the restored profile arrives.
test.failing('a returning user on a new device is not sent to onboarding while restore runs', async () => {
  renderApp();
  await settle();
  await act(async () => { jest.advanceTimersByTime(3000); });
  await settle();
  expect(mockRouter.replace).not.toHaveBeenCalledWith('/onboarding');
  expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
});
