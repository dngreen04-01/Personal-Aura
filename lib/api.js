import Constants from 'expo-constants';
import { getIdToken } from './auth';

// In development, use local server. In production, point to deployed URL.
const getBaseUrl = () => {
  if (__DEV__) {
    // Works with both Expo Go and expo-dev-client
    const debuggerHost = Constants.expoConfig?.hostUri
      || Constants.manifest2?.extra?.expoClient?.hostUri;
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

// --- Exercise Library ---

export async function fetchExercises({ category, equipment, difficulty, muscle, search } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = await authHeaders();
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (equipment) params.set('equipment', equipment);
    if (difficulty) params.set('difficulty', difficulty);
    if (muscle) params.set('muscle', muscle);
    if (search) params.set('search', search);
    const qs = params.toString();
    const res = await fetch(`${BASE_URL}/api/exercises${qs ? '?' + qs : ''}`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch exercises');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchExerciseDetail(exerciseId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/exercises/${exerciseId}`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch exercise');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchExercisesByNames(names) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/exercises/by-names`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ names }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch exercises');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchExerciseAlternatives(exerciseId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/exercises/${exerciseId}/alternatives`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch alternatives');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// --- Shared Locations ---

export async function fetchSharedLocations({ lat, lon, radius, search } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = await authHeaders();
    const params = new URLSearchParams();
    if (lat != null) params.set('lat', lat);
    if (lon != null) params.set('lon', lon);
    if (radius) params.set('radius', radius);
    if (search) params.set('search', search);
    const qs = params.toString();
    const res = await fetch(`${BASE_URL}/api/locations${qs ? '?' + qs : ''}`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch locations');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSharedLocationDetail(locationId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/locations/${locationId}`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch location');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function createSharedLocation({ name, address, lat, lon, equipment }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/locations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, address, lat, lon, equipment }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to create location');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function contributeEquipment(locationId, equipmentId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/locations/${locationId}/equipment`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ equipmentId }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to contribute equipment');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function reportMissingEquipment(locationId, equipmentId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/locations/${locationId}/report-missing`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ equipmentId }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to report missing equipment');
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function claimSharedLocation(locationId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${BASE_URL}/api/locations/${locationId}/claim`, {
      method: 'POST',
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to claim location');
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
