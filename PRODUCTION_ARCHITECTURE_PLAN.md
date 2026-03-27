# Aura Production Architecture Plan

## Executive Summary

This document outlines the full production refactoring of the Aura fitness coaching app. The goals are:

1. **Separation of concerns** — Isolated frontend, backend, auth, and database layers
2. **Firebase integration** — Authentication and Firestore for cloud persistence with local SQLite cache
3. **Backend autonomy** — Server-side AI tasks (plan adjustments, progress analysis) independent of device
4. **Exercise media library** — Persistent store of exercises with images/GIFs
5. **Shared equipment databases** — Community-contributed equipment lists per gym location
6. **Social features** — Progress sharing and in-app competitions

---

## Progress Tracker

| Phase | Status | Completed |
|-------|--------|-----------|
| **Phase 1: Firebase Auth** | COMPLETE | 2026-03-15 |
| **Phase 2: Cloud Database** | COMPLETE | 2026-03-15 |
| **Phase 3: Backend Autonomy** | COMPLETE | 2026-03-15 |
| **Phase 4: Exercise Library** | COMPLETE | 2026-03-15 |
| **Phase 5: Shared Equipment** | COMPLETE | 2026-03-15 |
| **Phase 6: Social Features** | NOT STARTED | — |
| **Phase 7: Infrastructure** | COMPLETE | 2026-03-26 |

---

## Current State Analysis

| Layer | Current | Target |
|-------|---------|--------|
| **Auth** | Firebase Auth (email/password) | Firebase Auth (email, Google, Apple) |
| **Database** | Firestore (cloud) + SQLite (local cache) with write-through sync | Firestore (cloud) + SQLite (local cache) |
| **Backend** | Autonomous Express on Cloud Run with Firestore reads, background jobs, push notifications | Stateful user-aware service with background jobs |
| **Frontend** | Tightly coupled to local DB (auth token on all API calls) | API-first with offline-capable local cache |
| **Media** | Exercise data in Firestore, images/GIFs deferred (local placeholders) | Cloud Storage exercise library with media URLs |
| **Social** | Shared gym locations with community contributions | Progress sharing, friend system, competitions |

---

## Phase 1: Firebase Auth & Project Foundation — COMPLETE

> **Completed:** 2026-03-15
> **Status:** All code implemented. Awaiting local device testing (blocked by public WiFi during implementation).

### 1.1 Firebase Project Setup — DONE

Firebase project `aura-fitness-api` created and attached to existing GCP project (Cloud Run project ID: `177339568703`).

```
aura-fitness/
├── firebase.json           # Firebase project config
├── firestore.rules         # Security rules (all 6 collections covered)
├── firestore.indexes.json  # Empty indexes placeholder
├── storage.rules           # Cloud Storage rules (exercises, avatars, social)
└── .firebaserc             # Project alias: default → aura-fitness
```

**Services enabled:**
- Firebase Authentication — Email/Password + Google Sign-In enabled
- Cloud Firestore (Native mode) — ready for Phase 2
- Firebase Cloud Storage — rules deployed, ready for Phase 4

**Apple Sign-In:** Not yet enabled (requires Apple Developer account configuration)

### 1.2 Frontend Auth Layer — DONE

**Implementation decision: Firebase JS SDK (modular v9+) instead of `@react-native-firebase/*`**

The original plan called for `@react-native-firebase/*` native modules. We switched to the **Firebase JS SDK** (`firebase` npm package, modular v9+ API) because:
- Works with Expo managed workflow out of the box — no native module linking or custom dev client required
- Simpler dependency chain (single `firebase` package vs 4 separate `@react-native-firebase/*` packages)
- Auth persistence handled via `@react-native-async-storage/async-storage` with `getReactNativePersistence()`
- Trade-off: slightly less performant than native modules for Firestore real-time listeners (acceptable for Phase 2)

**Note:** `@react-native-async-storage/async-storage` does NOT require an Expo config plugin — it works as a standard dependency. Initial attempt to register it as a plugin in `app.json` caused a `PluginError` and was removed.

**New files created:**
```
lib/
├── firebase.js             # Firebase JS SDK init with AsyncStorage persistence
├── auth.js                 # signUp, signIn, signOut, resetPassword, getIdToken
└── authContext.js           # AuthProvider + useAuth() hook via onAuthStateChanged
```

**Actual dependencies added (frontend):**
```json
{
  "firebase": "^11.0.0",
  "@react-native-async-storage/async-storage": "2.1.2"
}
```

### 1.3 Backend Auth Middleware — DONE

**New file:** `server/middleware/auth.js`
- Verifies Firebase ID token via `firebase-admin` → `admin.auth().verifyIdToken()`
- Extracts `uid`, `email`, `displayName` from decoded token → attaches as `req.user`
- Returns 401 for missing/invalid `Authorization: Bearer <token>` header
- Uses `admin.credential.applicationDefault()` — works with `gcloud auth application-default login` locally and automatically on Cloud Run via attached service account

**All 4 existing API routes now protected:**
- `/api/agent` — coaching chat
- `/api/onboarding` — plan generation
- `/api/progress` — analytics insights
- `/api/programmer` — plan regeneration

Only `/health` remains public.

**Dependency added (backend):**
```json
{
  "firebase-admin": "^13.0.0"
}
```

### 1.4 Navigation & UI Updates — DONE

**Updated `app/_layout.js`:**
- Wrapped entire app in `<AuthProvider>` (above Stack navigator)

**New `app/auth.js`:**
- Three modes: sign-in, sign-up, password reset
- Email/password only for now (Google/Apple require native OAuth config — deferred)
- Password visibility toggle, form validation, Firebase error code mapping
- Dark theme with lime accent, matches existing design system

**Updated `app/index.js`:**
- Reads `useAuth()` → if `authLoading`, shows spinner
- If no `user` → redirects to `/auth`
- If `user` exists → checks SQLite onboarding status → routes to `/(tabs)` or `/onboarding`

**Updated `lib/api.js`:**
- New `authHeaders()` helper calls `getIdToken()` and injects `Authorization: Bearer <token>` on every request
- All 7 API functions updated to use `authHeaders()` instead of hardcoded `Content-Type` only

**Updated `app/(tabs)/profile.js`:**
- Displays `user.displayName` and `user.email` from Firebase auth context
- Added **Sign Out** button with confirmation alert → calls `signOut()` → redirects to `/auth`

### Phase 1 Discoveries & Notes for Future Phases

1. **Firebase project ID is `aura-fitness-api`** (not `aura-fitness` as assumed in original plan). This matches the existing GCP project with Cloud Run deployment.
2. **Expo `EXPO_PUBLIC_` prefix required** for frontend env vars — Firebase config uses `EXPO_PUBLIC_FIREBASE_*` naming convention so Expo bundles them into the client.
3. **Backend credentials for local dev** require `gcloud auth application-default login`. On Cloud Run, the attached service account provides credentials automatically.
4. **Google Sign-In on mobile** requires additional setup: OAuth 2.0 client IDs for iOS/Android, Expo config plugin for Google Sign-In. This is a follow-up task, not a blocker.
5. **Auth token refresh** is handled automatically by Firebase JS SDK — `getIdToken()` returns a fresh token if the current one is expired.
6. **No API versioning was needed** for Phase 1 — existing routes kept their paths, only gained auth middleware. The `/api/v2/` prefix plan can be revisited if needed in Phase 3.

---

## Phase 2: Cloud Database (Firestore) + Local SQLite Cache — COMPLETE

> **Completed:** 2026-03-15
> **Status:** All code implemented. Verified via syntax checks, import/export resolution, Metro bundler full iOS build (zero errors), and 23-assertion serialization roundtrip test suite.
>
> **Note from Phase 1:** Frontend uses Firebase JS SDK (`firebase` package), not `@react-native-firebase/firestore`. Firestore client uses `firebase/firestore` modular imports. Real-time listeners use `onSnapshot()` from the JS SDK.

### 2.1 Firestore Schema

```
users/{uid}/
├── profile/main                     # User profile document
│   ├── goal: string
│   ├── equipment: string
│   ├── experience: string
│   ├── age: number
│   ├── weightKg: number
│   ├── gender: string
│   ├── daysPerWeek: number
│   ├── minutesPerSession: number
│   ├── displayName: string
│   ├── avatarUrl: string
│   ├── pushToken: string            # Expo push token (Phase 3)
│   ├── currentStreak: number        # Maintained by streakChecker job (Phase 3)
│   ├── longestStreak: number        # Maintained by streakChecker job (Phase 3)
│   ├── lastWorkoutDate: string      # ISO date, maintained by streakChecker job (Phase 3)
│   ├── createdAt: timestamp
│   └── updatedAt: timestamp
│
├── plans/                           # Workout plans (versioned)
│   └── {planId}/
│       ├── version: number
│       ├── planJson: array           # Same structure as current
│       ├── generatedBy: string       # "onboarding" | "programmer" | "coach"
│       ├── createdAt: timestamp
│       └── active: boolean
│
├── sessions/                        # Workout sessions
│   └── {sessionId}/
│       ├── planDay: string
│       ├── focus: string
│       ├── locationId: string
│       ├── startedAt: timestamp
│       ├── endedAt: timestamp
│       ├── durationSeconds: number
│       └── sets/                     # Subcollection
│           └── {setId}/
│               ├── exerciseName: string
│               ├── setNumber: number
│               ├── weight: number
│               ├── weightUnit: string
│               ├── reps: number
│               ├── rpe: number
│               ├── restSeconds: number
│               └── loggedAt: timestamp
│
├── insights/                        # Weekly AI progress summaries (Phase 3)
│   └── {weekId}/                   # e.g., "2026-W11" (ISO 8601 week)
│       ├── sessionCount: number
│       ├── totalVolume: number
│       ├── totalSets: number
│       ├── streak: number
│       ├── prs: array
│       ├── topExercise: string
│       ├── insight: string          # AI-generated text from Gemini Flash-Lite
│       ├── weekId: string
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── preferences/
│   └── exerciseUnits               # Single document
│       └── {exerciseName}: string   # "kg" or "lbs"
│
├── locations/                       # User's private locations
│   └── {locationId}/
│       ├── name: string
│       ├── equipment: array
│       ├── isDefault: boolean
│       ├── sharedLocationRef: string # Optional ref to shared location
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── social/
│   ├── shareSettings               # Privacy preferences
│   │   ├── profilePublic: boolean
│   │   ├── shareWorkouts: boolean
│   │   └── shareProgress: boolean
│   └── friends/                     # Friend connections
│       └── {friendUid}/
│           ├── status: "pending" | "accepted"
│           ├── since: timestamp
│           └── displayName: string
│
└── competitions/                    # Competition memberships
    └── {competitionId}/
        └── joined: timestamp

# ---- Shared Collections (not user-scoped) ----

sharedLocations/                     # Community gym equipment databases
└── {locationId}/
    ├── name: string                 # "Gold's Gym - Downtown"
    ├── address: string
    ├── geopoint: geopoint           # For proximity search
    ├── equipment: array<string>     # Canonical equipment list
    ├── createdBy: string            # uid of creator
    ├── contributors: array<string>  # uids who have edited
    ├── verified: boolean            # Admin-verified flag
    ├── createdAt: timestamp
    └── updatedAt: timestamp

exercises/                           # Master exercise library
└── {exerciseId}/
    ├── name: string                 # "Barbell Bench Press"
    ├── category: string             # "compound" | "isolation" | "bodyweight"
    ├── primaryMuscles: array        # ["chest", "triceps"]
    ├── secondaryMuscles: array      # ["front_delts"]
    ├── equipment: array             # ["barbell", "bench"]
    ├── instructions: array<string>  # Step-by-step text
    ├── tips: array<string>          # Common cues
    ├── imageUrl: string             # Static image (Cloud Storage)
    ├── gifUrl: string               # Animated demo (Cloud Storage)
    ├── thumbnailUrl: string         # Small preview
    ├── difficulty: string           # "beginner" | "intermediate" | "advanced"
    ├── alternatives: array<string>  # Exercise IDs of substitutes
    └── tags: array<string>          # Searchable tags

competitions/                        # In-app competitions
└── {competitionId}/
    ├── name: string                 # "February Volume Challenge"
    ├── type: string                 # "volume" | "streak" | "strength" | "custom"
    ├── metric: string               # What's being measured
    ├── startDate: timestamp
    ├── endDate: timestamp
    ├── createdBy: string            # uid
    ├── isPublic: boolean
    ├── inviteCode: string           # For private competitions
    ├── participants/                # Subcollection
    │   └── {uid}/
    │       ├── displayName: string
    │       ├── avatarUrl: string
    │       ├── score: number
    │       ├── lastUpdated: timestamp
    │       └── joinedAt: timestamp
    └── rules: map                   # Competition-specific rules

feed/                                # Social feed (denormalized for fast reads)
└── {postId}/
    ├── authorUid: string
    ├── authorName: string
    ├── authorAvatar: string
    ├── type: string                 # "workout_complete" | "pr" | "streak" | "competition_win"
    ├── content: map                 # Type-specific data
    ├── visibility: string           # "public" | "friends" | "private"
    ├── likes: number
    ├── likedBy: array<string>       # uids (for small counts)
    ├── createdAt: timestamp
    └── expiresAt: timestamp         # Optional auto-cleanup
```

### 2.2 Sync Layer Architecture

**New file:** `lib/sync.js`

The sync layer is the critical bridge between local SQLite (for offline/fast reads) and Firestore (for persistence/sharing).

**Strategy: Write-through with background sync**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   UI Layer   │────▶│  SQLite     │────▶│  Firestore   │
│  (React)     │◀────│  (Local)    │◀────│  (Cloud)     │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                    │
      │  Read (fast)       │  Write-through     │  Real-time
      │◀───────────────────│───────────────────▶│  listener
      │                    │                    │
      │                    │  Queue failed      │
      │                    │  writes for retry  │
      │                    │                    │
```

**Sync rules:**
1. **Reads**: Always from SQLite first (instant), Firestore listener updates SQLite in background
2. **Writes**: Write to SQLite immediately, then async push to Firestore
3. **Conflict resolution**: Last-write-wins with timestamp comparison
4. **Offline queue**: Failed Firestore writes queued in SQLite `sync_queue` table, retried on connectivity
5. **Initial sync**: On first login, pull all user data from Firestore → SQLite

**New SQLite tables for sync:**
```sql
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection TEXT NOT NULL,      -- Firestore collection path
  document_id TEXT NOT NULL,     -- Firestore document ID
  operation TEXT NOT NULL,       -- "set" | "update" | "delete"
  data TEXT NOT NULL,            -- JSON payload
  created_at TEXT DEFAULT (datetime('now')),
  retry_count INTEGER DEFAULT 0,
  last_error TEXT
);

CREATE TABLE sync_state (
  collection TEXT PRIMARY KEY,
  last_synced_at TEXT,           -- Last successful sync timestamp
  version INTEGER DEFAULT 0
);
```

### 2.3 Database Layer Refactor

**Refactored `lib/database.js`:**

- All existing CRUD functions remain but gain a `syncToCloud` parameter (default: `true`)
- New wrapper pattern:

```javascript
// Example pattern for all write operations:
async function logSet(sessionId, exerciseName, ..., syncToCloud = true) {
  // 1. Write to SQLite (existing logic, unchanged)
  const db = await getDatabase();
  const result = await db.runAsync('INSERT INTO workout_sets ...', [...]);

  // 2. Queue cloud sync
  if (syncToCloud) {
    await queueSync('sets', result.lastInsertRowId, 'set', {
      sessionId, exerciseName, ...
    });
  }

  return result;
}
```

**New `lib/firestoreClient.js`:**
- Thin wrapper around Firestore SDK
- Handles serialization (timestamps, geopoints)
- Batch write support for sync queue processing
- Real-time listener management

---

## Phase 3: Backend Autonomy — COMPLETE

> **Completed:** 2026-03-15
> **Status:** All code implemented. Verified via 17-test suite: module resolution (14/14), unit tests (errorHandler, rate limiter, scheduler, job auth, ISO week calc), Express integration (middleware wiring, route mounting), and end-to-end HTTP tests (health, auth rejection, job key validation).

### 3.1 Implemented Backend Architecture

```
server/
├── index.js                    # Express app entry (requestIdMiddleware, rate limiters, job routes, errorHandler)
├── package.json                # No new dependencies needed
├── Dockerfile                  # Unchanged — Node 20 already supports all built-ins used
│
├── middleware/
│   ├── auth.js                 # Firebase token verification (Phase 1)
│   ├── rateLimit.js            # Per-user in-memory sliding window (20/min AI, 60/min general)
│   └── errorHandler.js         # AppError class, asyncHandler, requestIdMiddleware, structured JSON logging
│
├── routes/
│   ├── agent.js                # Coaching chat — Firestore streak enrichment on /greet, profile supplement on /
│   ├── onboarding.js           # Plan generation — saves plan to Firestore after generation
│   ├── progress.js             # Analytics — reads stats from Firestore when req.body empty
│   ├── programmer.js           # Plan regeneration — reads profile/plan/history from Firestore, saves plan back
│   └── jobs.js                 # Cloud Scheduler endpoints: streak-checker, progress-analyzer, plan-adjuster
│
├── services/
│   ├── firestore.js            # Admin Firestore client (11 functions — see 3.2)
│   ├── scheduler.js            # getEligibleUsers, runForAllUsers (per-user error isolation), logJobResult
│   └── notifications.js        # Expo Push API sender (sendPushNotification, sendBatchNotifications)
│
├── jobs/
│   ├── streakChecker.js        # Daily streak maintenance + milestone/reminder push notifications
│   ├── progressAnalyzer.js     # Weekly AI insight generation via Gemini Flash-Lite
│   └── planAdjuster.js         # Background plan optimization — reuses handlePlanRegeneration agent
│
├── scripts/
│   └── runJob.js               # Manual job runner for local dev: node server/scripts/runJob.js <job-name>
│
└── agents/                     # Existing AI agents (unchanged internally)
    ├── types.js
    ├── orchestrator.js
    ├── router.js
    ├── memory.js
    ├── planning.js
    ├── motivation.js
    └── visual.js
```

### 3.2 Firestore Admin Service (`server/services/firestore.js`)

Centralized server-side Firestore read/write layer. Reuses the same `firebase-admin` `initializeApp()` idempotent guard as `middleware/auth.js`. Uses `admin.firestore()` which bypasses client-side security rules (trusted server access).

**Exported functions (11):**
| Function | Purpose |
|----------|---------|
| `getFirestore()` | Singleton admin Firestore instance |
| `getUserProfile(uid)` | Read `users/{uid}/profile/main` |
| `getUserActivePlan(uid)` | Query `users/{uid}/plans` where `active == true`, limit 1 |
| `getUserSessions(uid, { days })` | Query `users/{uid}/sessions` with date range, ordered desc |
| `getSessionSets(uid, sessionId)` | Read `users/{uid}/sessions/{id}/sets` subcollection |
| `getCompletedSessionCount(uid, sinceDays)` | Count sessions since date |
| `getWorkoutStreak(uid)` | Compute consecutive-day streak from session dates |
| `saveNewPlan(uid, planJson, generatedBy)` | Write new plan doc, deactivate previous active plan (batched) |
| `saveInsight(uid, weekId, data)` | Write `users/{uid}/insights/{weekId}` |
| `updateUserProfile(uid, fields)` | Partial update on `users/{uid}/profile/main` |
| `getAllUserUids(filter)` | List user UIDs via collectionGroup query (for batch jobs) |

### 3.3 Background Job System

**Architecture:** Cloud Scheduler (GCP) → HTTP POST → Cloud Run `/api/jobs/{jobName}` → job handler.

Why Cloud Scheduler and not `node-cron`: Cloud Run is stateless, scales to zero, and multiple instances would duplicate cron jobs.

**Job auth:** `JOBS_API_KEY` env var validated via `x-jobs-key` header in `jobAuthMiddleware`. No Firebase token needed for server-to-server calls.

**Job: Streak Checker** (`jobs/streakChecker.js`)
```
Trigger:   Cloud Scheduler daily 9 PM UTC
Process:   Per user — compute streak → update profile (currentStreak, longestStreak, lastWorkoutDate)
           → send milestone push (7, 14, 30, 60, 100 days) or streak-at-risk reminder
Depends:   services/firestore.js, services/notifications.js
```

**Job: Progress Analyzer** (`jobs/progressAnalyzer.js`)
```
Trigger:   Cloud Scheduler Sunday 8 PM UTC
Filter:    Only users with sessions in past 7 days
Process:   Per user — compute weekly stats (volume, sets, PRs, top exercise)
           → call Gemini Flash-Lite for AI insight → save to users/{uid}/insights/{weekId}
           → send push notification with highlight
Depends:   services/firestore.js, services/notifications.js, @google/genai
```

**Job: Plan Adjuster** (`jobs/planAdjuster.js`)
```
Trigger:   Cloud Scheduler every 6 hours (job checks eligibility per user)
Eligible:  7+ completed sessions since last plan adjustment OR 7+ calendar days since active plan created
Process:   Per user — read profile, active plan, 30 days of sessions+sets
           → call handlePlanRegeneration from agents/planning.js (reuses existing agent)
           → save new plan via saveNewPlan(uid, plan, 'coach') → send push
Depends:   services/firestore.js, services/notifications.js, agents/planning.js
```

**Cloud Scheduler cron config** (GCP Console/CLI, not code):
```
streak-checker:      0 21 * * *     (daily 9 PM UTC)
progress-analyzer:   0 20 * * 0     (Sunday 8 PM UTC)
plan-adjuster:       0 */6 * * *    (every 6 hours)
```

**Local dev:** `node server/scripts/runJob.js streak-checker|progress-analyzer|plan-adjuster`

### 3.4 Middleware Stack

**Request processing order in `server/index.js`:**
```
cors() → express.json({ limit: '5mb' }) → requestIdMiddleware
  ├─ GET  /health                          (public)
  ├─ POST /api/jobs/*                      (jobAuthMiddleware — API key)
  ├─ POST /api/agent/*                     (authMiddleware → aiRateLimit)
  ├─ POST /api/onboarding                  (authMiddleware → aiRateLimit)
  ├─ POST /api/progress/*                  (authMiddleware → generalRateLimit)
  ├─ POST /api/programmer/*                (authMiddleware → aiRateLimit)
  └─ errorHandler                          (must be last — 4-arg Express error middleware)
```

**Rate limits:** AI endpoints (agent, onboarding, programmer) = 20 req/min per user. General endpoints (progress) = 60 req/min per user. In-memory sliding window by `req.user.uid`. Expired entries cleaned every 5 minutes.

**Error response shape:**
```json
{ "error": "message", "code": "PLAN_GENERATION_FAILED", "retryable": true, "requestId": "uuid" }
```

**Structured log format** (JSON, auto-parsed by Cloud Run → Cloud Logging):
```json
{ "severity": "ERROR", "message": "...", "uid": "...", "path": "...", "requestId": "...", "statusCode": 500 }
```

### 3.5 Route Modifications (Backward-Compatible)

All modified routes accept `req.body` data as before. Firestore reads are fallback-only — triggered when body data is missing/sparse. This ensures the frontend transition is non-breaking.

| Route | Firestore Read | Firestore Write |
|-------|---------------|-----------------|
| `POST /api/agent/greet` | `getWorkoutStreak(uid)` — enriches greeting with streak data | — |
| `POST /api/agent/` | `getUserProfile(uid)` — supplements sparse `userContext` | — |
| `POST /api/onboarding` | — | `saveNewPlan(uid, plan, 'onboarding')` |
| `POST /api/progress/insights` | `getUserSessions(uid)` + `getSessionSets()` when body empty | — |
| `POST /api/programmer/submit` | `getUserProfile`, `getUserActivePlan`, `getUserSessions` as fallbacks | `saveNewPlan(uid, plan, 'programmer')` |

### 3.6 Push Notifications (`services/notifications.js`)

Uses Expo Push API (`https://exp.host/--/api/v2/push/send`) — single HTTP POST, no platform-specific config. Node 20 built-in `fetch()`.

**Token lifecycle:**
1. Frontend registers token: `lib/authContext.js` calls `Notifications.getExpoPushTokenAsync()` on auth state change, writes to `users/{uid}/profile/main.pushToken`
2. Server reads token: `notifications.js` reads `pushToken` from profile before sending
3. Stale token cleanup: `DeviceNotRegistered` response triggers `FieldValue.delete()` on the `pushToken` field

### 3.7 Firestore Schema Additions (Phase 3)

New fields and collections added by Phase 3:

```
users/{uid}/
├── profile/main
│   ├── pushToken: string           # Expo push token (written by frontend, read by server)
│   ├── currentStreak: number       # Updated by streakChecker job
│   ├── longestStreak: number       # Updated by streakChecker job
│   └── lastWorkoutDate: string     # ISO date, updated by streakChecker job
│
└── insights/                       # NEW collection — weekly AI-generated progress summaries
    └── {weekId}/                   # e.g., "2026-W11"
        ├── sessionCount: number
        ├── totalVolume: number
        ├── totalSets: number
        ├── streak: number
        ├── prs: array
        ├── topExercise: string
        ├── insight: string         # AI-generated text from Gemini Flash-Lite
        ├── weekId: string
        ├── createdAt: string
        └── updatedAt: string
```

### 3.8 New Environment Variable

| Variable | Location | Purpose |
|----------|----------|---------|
| `JOBS_API_KEY` | `server/.env` | API key for Cloud Scheduler → job endpoint auth. Set in Cloud Run secrets for production. |

### 3.9 Verification Results (17-Test Suite)

| # | Test | Scope | Result |
|---|------|-------|--------|
| 1 | Module resolution | All 14 server modules require() without errors | PASS |
| 2 | AppError class | Constructor, defaults, instanceof Error | PASS |
| 3 | requestIdMiddleware | UUID generation (36-char), next() called | PASS |
| 4 | asyncHandler | Catches async rejections, passes to next(); success passthrough | PASS |
| 5 | errorHandler response | JSON shape (error, code, retryable, requestId) | PASS |
| 6 | errorHandler logging | Structured JSON, WARNING for 4xx, ERROR for 5xx, stack on 5xx only | PASS |
| 7 | Rate limiter — within limit | 3 requests pass through | PASS |
| 8 | Rate limiter — over limit | 4th request gets 429 with Retry-After header | PASS |
| 9 | Rate limiter — per-user isolation | Different UIDs have independent windows | PASS |
| 10 | Rate limiter — window expiry | Requests pass again after window resets | PASS |
| 11 | Firestore service | 11 exports verified as functions, correct arities, valid db instance | PASS |
| 12 | Job auth middleware | Rejects missing key (500), wrong key (401), accepts correct key | PASS |
| 13 | Scheduler logic | Per-user error isolation, logJobResult structured output | PASS |
| 14 | ISO week calculation | Fixed algorithm (Thursday-aligned), verified against known dates | PASS |
| 15 | Express integration | 5 routers mounted, requestIdMiddleware registered, errorHandler at end | PASS |
| 16 | HTTP end-to-end | GET /health → 200, POST /api/agent → 401 (no auth), POST /api/jobs → 401 (bad key) | PASS |
| 17 | runJob.js CLI | Prints usage with 3 valid job names when run without args | PASS |

**Bug found and fixed during testing:** ISO 8601 week number calculation in `progressAnalyzer.js` was off by one. Original algorithm used `d.getDate() + 3 - ((d.getDay() + 6) % 7)` which computed Thursday incorrectly. Fixed to `d.getDate() + 4 - (d.getDay() || 7)` — the standard Thursday-alignment formula that correctly handles Sunday (day 0 → 7).

### 3.10 API Routes for Future Phases (Not Yet Implemented)

These routes were described in the original architecture plan but belong to Phases 4-6:

| Route | Phase | Purpose |
|-------|-------|---------|
| `/api/exercises` | Phase 4 | Exercise library CRUD |
| `/api/locations` | Phase 5 | Shared location management |
| `/api/social` | Phase 6 | Social features (feed, friends, sharing) |
| `/api/competitions` | Phase 6 | Competition management |

**Deferred jobs** (depend on Phase 6 social infrastructure):
- `server/jobs/competitionScorer.js` — Real-time competition leaderboard updates
- `server/jobs/feedGenerator.js` — Generate social feed entries from user activity

---

## Phase 4: Exercise Library & Media — COMPLETE

> **Completed:** 2026-03-15
> **Status:** Exercise data seeded to Firestore from `Docs/Exercise_Reference.json`. Frontend exercise browser, detail view, and workout integration implemented. Exercise media (images/GIFs) deferred — using local placeholders for now.

### 4.1 Exercise Data — Seeded to Firestore

The exercise library was provided as a curated JSON file (`Docs/Exercise_Reference.json`) and uploaded to the Firestore `exercises/` collection via `server/scripts/seedExercises.js`.

**Seed script features:**
- Reads `Docs/Exercise_Reference.json` (concatenated JSON arrays handled)
- Transforms raw data: infers `category` (Push/Pull/Legs/Core/Cardio/Compound) from tags and primary muscles
- Infers `difficulty` (beginner/intermediate/advanced) from tags
- Uses slug of exercise name as Firestore document ID (e.g., `barbell-back-squat`)
- Batch writes (450 per batch) with `merge: true` to preserve existing media URLs
- Idempotent — safe to re-run

**Usage:** `node server/scripts/seedExercises.js`

### 4.2 Exercise Media — Deferred (Using Placeholders)

Exercise images and GIFs will be generated later in development. For now, local placeholder assets exist at:

```
/Users/damiengreen/Downloads/exercise_assets (1)/
├── 1_barbell_back_squat/
│   ├── animation.gif          # Animated demo placeholder
│   ├── image.png              # Static form image placeholder
│   └── thumbnail.png          # Thumbnail placeholder
├── 2_standard_push_up/
│   └── ...
└── ...
```

**Cloud Storage structure (planned, not yet populated):**
```
gs://aura-fitness-media/
├── exercises/
│   ├── images/{slug}.webp         # Static form image
│   ├── gifs/{slug}.gif            # Animated demo
│   └── thumbnails/{slug}-thumb.webp   # 150x150 thumbnail
├── avatars/
│   └── {uid}/profile.webp        # User avatar (Phase 6)
└── social/
    └── {postId}/media.webp       # Shared images (Phase 6)
```

**Upload pipeline** (`server/scripts/generateExerciseMedia.js`) exists as a scaffold. When media is ready, it will upload assets to Cloud Storage and update Firestore `exercises/` docs with `imageUrl`, `gifUrl`, `thumbnailUrl` fields. The seed script uses `merge: true` so media URL fields will be preserved across re-seeds.

### 4.3 Firestore Service — Exercise Functions

Added to `server/services/firestore.js`:
| Function | Purpose |
|----------|---------|
| `getExercises({ category, equipment, difficulty, muscle, search, limit, startAfter })` | Paginated exercise query with client-side text search |
| `getExerciseById(exerciseId)` | Single exercise lookup |
| `getExercisesByNames(names)` | Batch lookup by name (chunks of 30 for Firestore `in` limit) |
| `getExerciseAlternatives(exerciseId)` | Returns alternative exercises by name reference |

### 4.4 Frontend Exercise Browser

**New screen:** `app/exercises.js`
- Searchable, filterable exercise catalog
- Filter by: muscle group, equipment, difficulty
- Each exercise shows: name, thumbnail, primary muscles, equipment needed
- Tap for detail view

**New component:** `components/ExerciseDetail.js`
- Full exercise detail: image/GIF, instructions, tips, alternatives
- Equipment requirements and difficulty badge

**Integration with existing features:**
- Exercise swap widget pulls from exercise library instead of AI-only suggestions
- Workout screen shows exercise media inline

---

## Phase 5: Shared Equipment Database — COMPLETE

> **Completed:** 2026-03-15
> **Status:** All code implemented. Shared locations API, community contribution model, and frontend location discovery screen implemented.

### 5.1 Location Sharing Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ User creates  │────▶│ Stored in    │────▶│ Other users  │
│ gym location  │     │ sharedLocations│   │ can find &   │
│ + equipment   │     │ collection    │    │ claim it     │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                     ┌─────▼─────┐
                     │ Multiple   │
                     │ users can  │
                     │ contribute │
                     │ equipment  │
                     │ updates    │
                     └───────────┘
```

### 5.2 Equipment Contribution Model

1. **Creator** adds initial location with equipment list
2. **Contributors** can suggest additions/removals (stored as pending edits)
3. **Consensus**: If 2+ users confirm equipment exists, it's auto-verified
4. **Admin override**: Verified locations get a badge, edits require fewer confirmations

### 5.3 Frontend Location Updates

**Updated `app/locations.js`:**
- "Find Nearby Gyms" button (uses device geolocation)
- Shows shared locations on a simple list (sorted by distance)
- "Claim This Gym" links shared location to user's profile
- "Add Equipment" / "Report Missing" for community contributions
- Equipment list syncs to AI coach context (knows what's available)

### 5.4 Firestore Service — Shared Location Functions

Added to `server/services/firestore.js`:
| Function | Purpose |
|----------|---------|
| `getSharedLocations({ lat, lon, radiusKm, search, limit })` | Proximity-based location search with text filtering |
| `getSharedLocationById(locationId)` | Single location lookup |
| `createSharedLocation({ name, address, lat, lon, equipment, createdBy })` | Create new shared location |
| `addEquipmentContribution(locationId, uid, equipmentId)` | Add equipment with contributor tracking |
| `reportMissingEquipment(locationId, uid, equipmentId)` | Report missing equipment (auto-removes at 2+ votes) |
| `claimSharedLocation(locationId, uid)` | Claim/join a shared location |

### 5.5 API Route — `server/routes/locations.js`

Shared locations REST API with auth middleware. Supports:
- `GET /api/locations` — search by proximity and text
- `GET /api/locations/:id` — get location detail
- `POST /api/locations` — create new location
- `POST /api/locations/:id/equipment` — contribute equipment
- `POST /api/locations/:id/missing` — report missing equipment
- `POST /api/locations/:id/claim` — claim a location

---

## Phase 6: Social Features

### 6.1 Progress Sharing

**Shareable content types:**
| Type | Trigger | Content |
|------|---------|---------|
| Workout Complete | End of session | Duration, exercises, total volume, highlight set |
| Personal Record | New max weight/reps | Exercise name, old PR → new PR, % improvement |
| Streak Milestone | 7, 14, 30, 60, 100 days | Streak count, total sessions, consistency % |
| Competition Win | Competition ends | Rank, score, competition name |
| Plan Complete | Finish full program cycle | Summary stats, before/after metrics |

**Share destinations:**
- **In-app feed** — visible to friends or public
- **External share** — Generate shareable image card (via Visual Agent) → share sheet (Instagram, Twitter, etc.)

### 6.2 Social Feed

**New tab or screen:** `app/(tabs)/social.js` or `app/social.js`

- Scrollable feed of friends' activity
- Like/react to posts
- Tap to view detail (e.g., full workout breakdown)
- Filter: All, Friends Only, Competitions

### 6.3 Friend System

- Search users by display name or email
- Send/accept/decline friend requests
- Friends list in profile
- Friend activity visible in feed
- Compare progress with friends (side-by-side charts)

### 6.4 In-App Competitions

**Competition types:**

| Type | Metric | Duration |
|------|--------|----------|
| **Volume Challenge** | Total weight lifted (kg) | 1 week / 1 month |
| **Streak Wars** | Consecutive workout days | Ongoing until broken |
| **Strength Showdown** | Max weight on specific lift | 1 month |
| **Consistency Cup** | Sessions completed / planned | 1 month |
| **Custom** | User-defined metric | User-defined |

**Competition flow:**
1. Create competition (set type, duration, invite friends or make public)
2. Join via invite code or browse public competitions
3. Real-time leaderboard updates as participants log workouts
4. Push notifications for position changes and milestones
5. Winner announcement with shareable results card

**New screen:** `app/competition.js`
- Competition detail view
- Live leaderboard
- Join/leave actions
- Create new competition flow

---

## Phase 7: Infrastructure & DevOps — COMPLETE

> **Completed:** 2026-03-26
> **Status:** All infrastructure hardening, CI/CD pipelines, deployment automation, and monitoring setup implemented.

### 7.1 Environment Configuration — DONE

**`.env.example` files created** to document required variables for new developer setup:
- `/.env.example` — Frontend: Gemini API key + 6 Firebase config vars
- `/server/.env.example` — Backend: Gemini API key, PORT, JOBS_API_KEY, NODE_ENV, CORS_ORIGIN

**Production secrets** managed via GCP Secret Manager (not environment variables):
- `gemini-api-key` — Gemini AI API key
- `jobs-api-key` — Cloud Scheduler job authentication key

Secrets are injected into Cloud Run via `--set-secrets` flag in the deploy script.

### 7.2 Firestore Security Rules — DONE (Phase 1)

Security rules were deployed in Phase 1 and cover all collections: users, exercises, sharedLocations, feed, competitions. See `firestore.rules` for the full ruleset.

**Firestore composite indexes:** Not needed. All current queries use single-field filters or filter+orderBy on the same field. The `firestore.indexes.json` remains empty.

### 7.3 Security Hardening — DONE

**Helmet middleware** added to `server/index.js`:
- Sets `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `X-Frame-Options`, and other security headers automatically
- Dependency: `helmet` ^8.0.0

**CORS restriction** in `server/index.js`:
- Configurable via `CORS_ORIGIN` environment variable
- Development: allows all origins (default when `CORS_ORIGIN` not set)
- Production: set `CORS_ORIGIN` to restrict (note: mobile app `fetch` calls don't send `Origin` headers like browsers, so this is defense-in-depth)
- Allowed methods: GET, POST, PUT, DELETE
- Allowed headers: Content-Type, Authorization, x-jobs-key

**Dependency pinning:**
- `@google/genai` changed from `"latest"` to `"^1.44.0"` to prevent breaking changes on `npm install`

**Dockerfile hardening:**
- Added `ENV NODE_ENV=production` so Express runs in production mode (less verbose errors, view caching)

### 7.4 Cloud Run Deployment — DONE

**Deployment script:** `server/deploy.sh`
- Builds Docker image via Cloud Build
- Deploys to Cloud Run with production configuration:
  - Memory: 1GB, CPU: 2
  - Min instances: 1 (avoids cold starts), Max instances: 10
  - Secrets injected from Secret Manager: `gemini-api-key`, `jobs-api-key`
  - Environment: `NODE_ENV=production`, `PORT=8080`

**Prerequisites (one-time GCP setup):**
1. Create secrets in Secret Manager: `gemini-api-key`, `jobs-api-key`
2. Grant Cloud Run service account `roles/secretmanager.secretAccessor`

### 7.5 CI/CD Pipelines — DONE

**Backend CI/CD:** `.github/workflows/deploy-backend.yml`
- Triggers on push to `main` when `server/**` files change, or manual dispatch
- Uses Workload Identity Federation for keyless GCP auth (no service account keys)
- Builds Docker image and deploys to Cloud Run
- GitHub Secrets required: `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`

**Mobile builds:** `.github/workflows/build-mobile.yml`
- Triggers on version tags (`v*`) or manual dispatch
- Installs dependencies, sets up EAS CLI
- Runs `eas build --platform all --profile production`
- GitHub Secret required: `EXPO_TOKEN`

### 7.6 Health Checks — DONE

**Liveness probe:** `GET /health` — lightweight, returns `{status: 'ok', timestamp}`

**Deep health check:** `GET /health/deep` — verifies Firestore connectivity by writing to `_health/ping`. Returns 503 with `{status: 'degraded'}` if Firestore is unreachable.

### 7.7 Monitoring & Observability — DONE

**Already implemented (Phases 1-3):**
- Structured JSON logging via `errorHandler.js` — auto-parsed by Cloud Run into Cloud Logging
- Request tracing via `requestIdMiddleware` — UUID v4 per request, included in all error responses and logs
- Job monitoring via `scheduler.js` — structured completion summaries with per-user error isolation

**Added in Phase 7:**
- **Cloud Error Reporting opt-in:** Added `@type` field to 5xx error log entries in `errorHandler.js`. Cloud Error Reporting now auto-groups errors with stack traces.
- **Monitoring setup script:** `server/infra/setup-monitoring.sh` — creates GCP uptime check on `/health` (5-min interval) and documents alert policy setup for:
  - Health check failure (email immediately)
  - Cloud Run 5xx rate > 5% over 5 min
  - Cloud Run p95 latency > 30s over 5 min

### 7.8 Docker & Git Hygiene — DONE

**`server/.dockerignore`** expanded to exclude: scripts/, *.md, .env.*, Dockerfile, .gitignore

**`server/.gitignore`** created to cover: node_modules/, .env, .env.*, npm-debug.log

### Phase 7 Discoveries & Notes

1. **Firestore composite indexes not needed**: All current queries use single-field filters or same-field filter+orderBy. If future queries combine filters on different fields, Firestore will return an error with a direct link to create the needed index.
2. **Cloud Error Reporting is essentially free**: It automatically parses the structured JSON logs already being emitted. The only change needed was adding the `@type` field to 5xx log entries.
3. **CORS is defense-in-depth for mobile**: React Native `fetch` calls don't send `Origin` headers the way browsers do, so CORS restrictions are less critical for a mobile-only backend. Still good practice.
4. **Workload Identity Federation preferred over service account keys**: The CI/CD pipeline uses WIF for keyless GCP authentication, avoiding long-lived credentials in GitHub Secrets.
5. **Staging environment intentionally omitted**: For a personal app, a single production environment with the deploy script is sufficient. Add staging only if user base grows.
6. **Secret rotation advisory**: The Gemini API key `AIzaSyBXmN09K7bdEODboFYvgOp2DS_2Of0Uyz8` is in git history from earlier commits. It should be rotated in Google AI Studio. The Firebase API key is a client-side key restricted by security rules and is not a critical secret.

---

## Implementation Order & Dependencies

```
Phase 1: Firebase Auth ──────────────────────────────────────┐
  ├─ 1.1 Firebase project setup                             │
  ├─ 1.2 Frontend auth (firebase.js, auth.js, AuthContext)   │
  ├─ 1.3 Backend auth middleware                             │
  └─ 1.4 Auth screen + navigation updates                   │
                                                             │
Phase 2: Cloud Database ─────────────────────────────────────┤
  ├─ 2.1 Firestore schema setup                             │
  ├─ 2.2 Sync layer (lib/sync.js)                           │
  ├─ 2.3 Refactor lib/database.js (write-through pattern)   │
  └─ 2.4 Firestore client (lib/firestoreClient.js)          │
                                                             │
Phase 3: Backend Autonomy ───────────────────────────────────┤
  ├─ 3.1 Backend restructure (middleware, services, jobs)    │
  ├─ 3.2 Background jobs (plan adjuster, progress, streaks) │
  ├─ 3.3 Existing routes add auth + Firestore               │
  └─ 3.4 Push notification service                          │
                                                             │
Phase 4: Exercise Library ───────────────────────────────────┤
  ├─ 4.1 Cloud Storage setup + upload pipeline               │
  ├─ 4.2 Seed exercises collection (300+ exercises)          │
  ├─ 4.3 Exercise API routes                                │
  └─ 4.4 Exercise browser screen                            │
                                                             │
Phase 5: Shared Equipment ───────────────────────────────────┤
  ├─ 5.1 Shared locations collection + API                   │
  ├─ 5.2 Location search (geolocation)                      │
  └─ 5.3 Community contribution flow                        │
                                                             │
Phase 6: Social Features ───────────────────────────────────┘
  ├─ 6.1 Friend system (requests, list, compare)
  ├─ 6.2 Progress sharing (in-app + external)
  ├─ 6.3 Social feed
  ├─ 6.4 Competition system
  └─ 6.5 Push notifications for social events
```

**Critical path:** Phase 1 → Phase 2 → Phase 3 (each depends on the previous) — **ALL COMPLETE**.
Phases 4 and 5 — **COMPLETE**. Exercise data seeded to Firestore, shared locations API operational.
Phase 7 (Infrastructure) — **COMPLETE**. CI/CD, security hardening, deployment automation, and monitoring all in place.
Phase 6 (Social Features) is the only remaining phase — can begin immediately.

**Exercise media note:** Images and GIFs are not yet uploaded to Cloud Storage. Placeholder assets exist locally at `/Users/damiengreen/Downloads/exercise_assets (1)/`. The upload pipeline (`server/scripts/generateExerciseMedia.js`) will be used later in development to populate Cloud Storage and update Firestore docs with media URLs.

---

## Migration Strategy

### Existing User Data Migration

Since there's no current auth system or cloud database, migration is straightforward:

1. **First-time cloud user**: On first sign-in, check Firestore for existing data
2. **Local data upload**: Prompt user to "Upload your existing workout data to the cloud"
3. **One-time sync**: Push all SQLite data to Firestore, mark as synced
4. **Ongoing**: Write-through sync handles all future data

### API Versioning

> **Phase 3 decision:** API versioning was not needed. All Phase 3 route modifications are backward-compatible — routes accept `req.body` as before and fall back to Firestore reads when body data is absent. The `/api/v2/` prefix plan can be revisited for Phases 4-6 if breaking changes are introduced.

- Keep existing `/api/` routes functional (no breaking changes through Phase 3)
- New Phase 4-6 routes (exercises, locations, social, competitions) may use `/api/` directly since they're net-new endpoints with no legacy callers

---

## File Change Summary

### Phase 1 — Completed Files

**New files created:**
| File | Purpose | Status |
|------|---------|--------|
| `firebase.json` | Firebase project config | DONE |
| `firestore.rules` | Firestore security rules (all collections) | DONE |
| `firestore.indexes.json` | Composite indexes placeholder | DONE |
| `storage.rules` | Cloud Storage security rules | DONE |
| `.firebaserc` | Firebase project alias | DONE |
| `lib/firebase.js` | Firebase JS SDK init + AsyncStorage persistence | DONE |
| `lib/auth.js` | Auth functions (signUp, signIn, signOut, resetPassword, getIdToken) | DONE |
| `lib/authContext.js` | AuthProvider + useAuth() hook | DONE |
| `app/auth.js` | Sign-in/sign-up/reset screen (email/password) | DONE |
| `server/middleware/auth.js` | Firebase Admin token verification middleware | DONE |

**Modified files:**
| File | Changes | Status |
|------|---------|--------|
| `app/_layout.js` | Wrapped app in `<AuthProvider>` | DONE |
| `app/index.js` | Auth state check → route to /auth, /onboarding, or /(tabs) | DONE |
| `lib/api.js` | `authHeaders()` injects Bearer token on all 7 API functions | DONE |
| `app/(tabs)/profile.js` | Shows Firebase displayName/email, added Sign Out button | DONE |
| `server/index.js` | All `/api/*` routes guarded by `authMiddleware` | DONE |
| `package.json` | Added `firebase` ^11.0.0, `@react-native-async-storage/async-storage` 2.1.2 | DONE |
| `server/package.json` | Added `firebase-admin` ^13.0.0 | DONE |
| `.env` | Added 6 `EXPO_PUBLIC_FIREBASE_*` variables (populated) | DONE |

### Phase 2 — Completed Files

**New files created:**
| File | Purpose | Status |
|------|---------|--------|
| `lib/firestoreClient.js` | Firestore SDK wrapper: path builders, 6 field mappings, serialization, batch writes, listeners | DONE |
| `lib/sync.js` | Sync engine: initial sync, queue processing, real-time listeners, conflict resolution | DONE |

**Modified files:**
| File | Changes | Status |
|------|---------|--------|
| `lib/firebase.js` | Added `getFirestore(app)` import and export | DONE |
| `lib/database.js` | User-keyed DB (`aura_{uid}.db`), `sync_queue`/`sync_state` tables, `updated_at`/`firestore_id`/`active` column migrations, 7 sync queue helpers, write-through on 10 functions, `closeDatabase()` export | DONE |
| `lib/authContext.js` | Init/teardown sync on auth state changes, `syncStatus` in context, cleanup ref | DONE |

### Phase 2 Discoveries & Notes for Future Phases

1. **User-keyed SQLite databases** (`aura_{uid}.db`) were chosen over adding `user_id` columns. This means zero query changes to existing read functions — data isolation is handled at the file level. On sign-out `closeDatabase()` is called; on sign-in `getDatabase(uid)` opens the correct DB.
2. **Circular import avoidance**: `database.js` ↔ `sync.js` would create a circular dependency. Solved by using dynamic `require('./sync')` inside write functions rather than top-level imports. Metro handles this correctly.
3. **Firestore ID generation is client-side**: `doc(collection(firestore, ...)).id` generates a random ID without a network call. This is critical for `startSession` — the Firestore ID is stored in `firestore_id` column immediately so that `logSet` can build the correct subcollection path (`sessions/{fsId}/sets/{setFsId}`).
4. **Queue ordering matters for FK integrity**: `processQueue()` sorts items by collection depth (shallow first) and `created_at`, ensuring parent session docs are written to Firestore before their child set docs.
5. **No new dependencies needed**: `firebase/firestore` is included in the existing `firebase` ^11.0.0 package. All 15 Firestore SDK exports verified present.
6. **Selective real-time listeners**: Only `profile` and active `plan` have `onSnapshot` listeners. Sessions/sets are write-heavy during workouts and don't need cross-device real-time sync. This keeps Firestore read costs minimal.
7. **`onSnapshot` on queries vs docs**: The active plan listener uses a collection query (`where('active', '==', true), limit(1)`) — this requires `onSnapshot` from `firebase/firestore` directly, not the `subscribeToDoc` wrapper (which expects a doc ref). This distinction is handled in `setupRealtimeListeners()`.
8. **All existing call sites are backward-compatible**: The new `{ syncToCloud = true }` options parameter is the last argument with a default, so all 16 existing callers continue working without changes.

### Phase 3 — Completed Files

**New files created:**
| File | Purpose | Status |
|------|---------|--------|
| `server/services/firestore.js` | Admin Firestore read/write layer — 11 core functions (Phase 3) + 4 exercise functions (Phase 4) + 6 shared location functions (Phase 5) = 21 total | DONE |
| `server/middleware/errorHandler.js` | AppError class, asyncHandler wrapper, requestIdMiddleware, centralized error handler with structured JSON logging | DONE |
| `server/middleware/rateLimit.js` | Per-user in-memory sliding window rate limiter (60 req/min general, 20 req/min AI endpoints) | DONE |
| `server/services/notifications.js` | Expo Push API sender (sendPushNotification, sendBatchNotifications) with DeviceNotRegistered handling | DONE |
| `server/services/scheduler.js` | Job utilities (getEligibleUsers, runForAllUsers with per-user error isolation, logJobResult) | DONE |
| `server/routes/jobs.js` | HTTP endpoints for Cloud Scheduler triggers (streak-checker, progress-analyzer, plan-adjuster) with API key auth | DONE |
| `server/jobs/streakChecker.js` | Daily streak maintenance: computes streak, sends milestone/reminder notifications, updates profile | DONE |
| `server/jobs/progressAnalyzer.js` | Weekly AI insight generation: computes stats, calls Gemini Flash-Lite, saves to insights collection | DONE |
| `server/jobs/planAdjuster.js` | Background plan optimization: checks eligibility (7+ sessions or 7+ days), reuses handlePlanRegeneration agent | DONE |
| `server/scripts/runJob.js` | Manual job runner for local development | DONE |

**Modified files:**
| File | Changes | Status |
|------|---------|--------|
| `server/index.js` | Added requestIdMiddleware, rate limiters (AI + general), job routes with API key auth, centralized errorHandler | DONE |
| `server/routes/onboarding.js` | Wrapped with asyncHandler, saves plan to Firestore after generation via saveNewPlan | DONE |
| `server/routes/progress.js` | Wrapped with asyncHandler, reads stats from Firestore if req.body.recentStats absent | DONE |
| `server/routes/programmer.js` | Wrapped with asyncHandler, reads profile/plan/history from Firestore as fallback, saves plan back | DONE |
| `server/routes/agent.js` | Wrapped with asyncHandler, /greet enriched with Firestore streak data, / endpoint supplements sparse userContext with profile | DONE |
| `lib/authContext.js` | Registers Expo push token to Firestore on auth state change | DONE |
| `server/.env` | Added JOBS_API_KEY | DONE |

### Phase 3 Discoveries & Notes for Future Phases

1. **No new npm dependencies needed**: `firebase-admin` (Firestore Admin via `admin.firestore()`) was already installed for auth. `@google/genai` already installed for AI. Expo Push API uses Node 20 built-in `fetch()`. `crypto.randomUUID()` is Node 20 built-in.
2. **Firestore Admin bypasses security rules**: Server uses `admin.firestore()` which has full read/write access. This is the correct pattern for trusted server-side access — no need to configure service account permissions beyond the default.
3. **Profile document path is `users/{uid}/profile/main`**: This matches the client-side write path from `lib/sync.js`. The Firestore service mirrors camelCase field names from `lib/firestoreClient.js` mappings.
4. **Rate limiting is per-uid, not per-IP**: Cloud Run routes through GCP load balancers, so IP-based limiting would be unreliable. Per-user limiting via `req.user.uid` is accurate after auth middleware.
5. **Job auth uses simple API key**: `JOBS_API_KEY` env var, validated via `x-jobs-key` header. Cloud Scheduler sends this key. No Firebase auth token needed for jobs since they run server-to-server.
6. **Plan adjuster reuses `handlePlanRegeneration` directly**: The existing `agents/planning.js` function accepts `{ userProfile, currentPlan, workoutHistory, schedule }` and returns a new plan. The job is a thin data-sourcing wrapper that reads from Firestore instead of `req.body`.
7. **Route modifications are backward-compatible**: All modified routes accept `req.body` data as before, and fall back to Firestore reads only when body data is missing/sparse. This ensures the frontend transition is non-breaking.
8. **Cloud Scheduler cron config is external**: Jobs are triggered via HTTP POST to `/api/jobs/{jobName}`. Cron schedules are configured in GCP Console/CLI, not in code. Recommended schedules: streak-checker daily 9PM UTC, progress-analyzer Sunday 8PM UTC, plan-adjuster every 6 hours.
9. **Push token stored in Firestore profile**: `users/{uid}/profile/main.pushToken` field. Written by the frontend on auth state change. Read by `notifications.js` when sending pushes. Stale tokens (DeviceNotRegistered) are auto-cleared.
10. **Deferred to Phase 6**: `competitionScorer.js` and `feedGenerator.js` jobs are not implemented — they depend on social features infrastructure.

### Phase 4 — Completed Files

**New files created:**
| File | Purpose | Status |
|------|---------|--------|
| `server/routes/exercises.js` | Exercise library API (search, filter, detail, alternatives) | DONE |
| `server/scripts/seedExercises.js` | Exercise data seeder (Firestore `exercises/` from `Exercise_Reference.json`) | DONE |
| `server/scripts/generateExerciseMedia.js` | Exercise media upload scaffold (deferred — placeholder assets only) | SCAFFOLD |
| `app/exercises.js` | Exercise browser screen (search, filter, pagination) | DONE |
| `components/ExerciseDetail.js` | Exercise detail view (instructions, tips, alternatives, media) | DONE |
| `Docs/Exercise_Reference.json` | Curated exercise library dataset | DONE |

**Modified files:**
| File | Changes | Status |
|------|---------|--------|
| `server/services/firestore.js` | Added getExercises, getExerciseById, getExercisesByNames, getExerciseAlternatives | DONE |
| `server/index.js` | Mounted `/api/exercises` route | DONE |

### Phase 5 — Completed Files

**New files created:**
| File | Purpose | Status |
|------|---------|--------|
| `server/routes/locations.js` | Shared locations API (CRUD, equipment contributions, proximity search) | DONE |
| `server/services/geoUtils.js` | Haversine distance calculation utility | DONE |

**Modified files:**
| File | Changes | Status |
|------|---------|--------|
| `server/services/firestore.js` | Added getSharedLocations, getSharedLocationById, createSharedLocation, addEquipmentContribution, reportMissingEquipment, claimSharedLocation | DONE |
| `server/index.js` | Mounted `/api/locations` route | DONE |

### Phase 7 — Completed Files

**New files created:**
| File | Purpose | Status |
|------|---------|--------|
| `.env.example` | Documents required frontend environment variables | DONE |
| `server/.env.example` | Documents required backend environment variables | DONE |
| `server/.gitignore` | Server-specific git ignore rules | DONE |
| `server/deploy.sh` | Automated Cloud Run deployment with Secret Manager | DONE |
| `.github/workflows/deploy-backend.yml` | GitHub Actions CI/CD for backend auto-deploy | DONE |
| `.github/workflows/build-mobile.yml` | GitHub Actions EAS mobile builds on version tags | DONE |
| `server/infra/setup-monitoring.sh` | GCP uptime check and alert policy setup | DONE |

**Modified files:**
| File | Changes | Status |
|------|---------|--------|
| `server/package.json` | Pinned `@google/genai` to `^1.44.0`, added `helmet` ^8.0.0 | DONE |
| `server/index.js` | Added helmet middleware, restricted CORS, added `/health/deep` endpoint | DONE |
| `server/Dockerfile` | Added `ENV NODE_ENV=production` | DONE |
| `server/middleware/errorHandler.js` | Added `@type` field for Cloud Error Reporting auto-grouping | DONE |
| `server/.dockerignore` | Expanded exclusions (scripts/, *.md, Dockerfile, etc.) | DONE |

### Remaining Files (Future Phases)

**Phase 6 — Social Features:**
| File | Purpose |
|------|---------|
| `server/routes/social.js` | Social features API |
| `server/routes/competitions.js` | Competition API |
| `server/jobs/competitionScorer.js` | Real-time competition leaderboard updates (deferred from Phase 3) |
| `server/jobs/feedGenerator.js` | Generate social feed entries from user activity (deferred from Phase 3) |
| `app/(tabs)/social.js` | Social feed tab |
| `app/competition.js` | Competition detail screen |
| `app/(tabs)/profile.js` | Update: avatar, friend list |
| `app/(tabs)/progress.js` | Update: share buttons |
