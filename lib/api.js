import Constants from 'expo-constants';

// In development, use local server. In production, point to deployed URL.
const getBaseUrl = () => {
  // For Expo Go on physical device, use your computer's local IP
  // For simulator, localhost works fine
  if (__DEV__) {
    // expo-constants gives us the debugger host which includes the IP
    const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
    if (debuggerHost) {
      const ip = debuggerHost.split(':')[0];
      return `http://${ip}:3001`;
    }
    return 'http://localhost:3001';
  }
  return 'https://your-production-server.com'; // Update for production
};

const BASE_URL = getBaseUrl();

export async function generatePlan(goal, equipment, baselines = {}, schedule = {}) {
  const res = await fetch(`${BASE_URL}/api/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, equipment, baselines, schedule }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to generate plan');
  }

  return res.json();
}

export async function getAuraInsight(recentStats) {
  const res = await fetch(`${BASE_URL}/api/progress/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recentStats }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get insight');
  }

  return res.json();
}

export async function sendCoachMessage(message, history = [], userContext = null) {
  const res = await fetch(`${BASE_URL}/api/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, userContext }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to reach Aura');
  }

  return res.json();
}

export async function submitPlanRegeneration(userProfile, currentPlan, workoutHistory, schedule) {
  const res = await fetch(`${BASE_URL}/api/programmer/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userProfile, currentPlan, workoutHistory, schedule }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to submit plan regeneration');
  }

  return res.json();
}
