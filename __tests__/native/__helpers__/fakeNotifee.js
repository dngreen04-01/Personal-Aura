/**
 * In-memory stand-in for @notifee/react-native.
 *
 * Tracks what is on screen (displayed) and what is scheduled (triggers) the
 * way the native module does, so tests can assert on end state rather than on
 * call order. Every API returns a promise that settles on a later microtask,
 * like the real bridge, so ordering bugs between un-awaited calls show up.
 */
const displayed = new Map();
const triggers = new Map();
let foregroundHandlers = [];
let backgroundHandler = null;

const tick = () => new Promise((resolve) => setImmediate(resolve));

const notifee = {
  displayNotification: jest.fn(async (n) => { await tick(); displayed.set(n.id, n); return n.id; }),
  createTriggerNotification: jest.fn(async (n, trigger) => { await tick(); triggers.set(n.id, { notification: n, trigger }); return n.id; }),
  cancelNotification: jest.fn(async (id) => { await tick(); displayed.delete(id); triggers.delete(id); }),
  cancelTriggerNotifications: jest.fn(async () => { await tick(); triggers.clear(); }),
  stopForegroundService: jest.fn(async () => { await tick(); }),
  createChannel: jest.fn(async (c) => c.id),
  setNotificationCategories: jest.fn(async () => {}),
  registerForegroundService: jest.fn(),
  onForegroundEvent: jest.fn((handler) => {
    foregroundHandlers.push(handler);
    return () => { foregroundHandlers = foregroundHandlers.filter((h) => h !== handler); };
  }),
  onBackgroundEvent: jest.fn((handler) => { backgroundHandler = handler; }),
};

const EventType = { UNKNOWN: -1, DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 };

module.exports = {
  __esModule: true,
  default: notifee,
  EventType,
  AndroidImportance: { LOW: 2, DEFAULT: 3, HIGH: 4 },
  AndroidVisibility: { PUBLIC: 1 },
  TriggerType: { TIMESTAMP: 0 },
  __state: {
    displayed,
    triggers,
    emitForeground: (event) => foregroundHandlers.forEach((h) => h(event)),
    emitBackground: (event) => backgroundHandler && backgroundHandler(event),
    reset: () => {
      displayed.clear();
      triggers.clear();
      foregroundHandlers = [];
      backgroundHandler = null;
    },
  },
};
