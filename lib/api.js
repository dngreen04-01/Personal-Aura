import Constants from 'expo-constants';
import { getIdToken } from './auth';

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
  return 'https://aura-api-177339568703.us-central1.run.app';
};

const BASE_URL = getBaseUrl();

async function authHeaders() {
  const token = await getIdToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function generatePlan(goal, equipment, baselines = {}, schedule = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/onboarding`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ goal, equipment, baselines, schedule }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to generate plan');
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAuraInsight(recentStats) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api/progress/insights`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recentStats }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get insight');
  }

  return res.json();
}

async function fetchWithRetry(url, options, { retries = 1, backoffMs = 2000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        const err = new Error(error.error || `Request failed (${res.status})`);
        err.retryable = error.retryable || res.status >= 500;
        throw err;
      }
      return res.json();
    } catch (err) {
      const isLastAttempt = attempt >= retries;
      const shouldRetry = !isLastAttempt && (err.retryable !== false) && err.name !== 'AbortError';
      if (!shouldRetry) throw err;
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
}

export async function sendAgentMessage(message, history = [], userContext = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const headers = await authHeaders();
    return await fetchWithRetry(
      `${BASE_URL}/api/agent`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, history, userContext }),
        signal: controller.signal,
      },
      { retries: 1, backoffMs: 2000 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function greetUser(userContext) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/agent/greet`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userContext }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Greeting failed');
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateExerciseImage(exercise, equipment, modification) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/agent/image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'exercise_demo', exercise, equipment, modification }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to generate image');
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateWorkoutCard(sessionStats) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/agent/image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'workout_card', sessionStats }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to generate workout card');
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitPlanRegeneration(userProfile, currentPlan, workoutHistory, schedule) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const headers = await authHeaders();
    return await fetchWithRetry(
      `${BASE_URL}/api/programmer/submit`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ userProfile, currentPlan, workoutHistory, schedule }),
        signal: controller.signal,
      },
      { retries: 1, backoffMs: 2000 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
