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

## Current State Analysis

| Layer | Current | Target |
|-------|---------|--------|
| **Auth** | None (single device user) | Firebase Auth (email, Google, Apple) |
| **Database** | SQLite only (on-device) | Firestore (cloud) + SQLite (local cache) |
| **Backend** | Stateless Express on Cloud Run | Stateful user-aware service with background jobs |
| **Frontend** | Tightly coupled to local DB | API-first with offline-capable local cache |
| **Media** | None | Cloud Storage exercise library |
| **Social** | None | Shared gyms, progress sharing, competitions |

---

## Phase 1: Firebase Auth & Project Foundation

### 1.1 Firebase Project Setup

```
aura-fitness/
├── firebase.json           # Firebase project config
├── firestore.rules         # Security rules
├── firestore.indexes.json  # Composite indexes
├── storage.rules           # Cloud Storage rules
└── .firebaserc             # Project aliases (dev/staging/prod)
```

**Services to enable:**
- Firebase Authentication (Email/Password, Google Sign-In, Apple Sign-In)
- Cloud Firestore (Native mode)
- Firebase Cloud Storage (exercise media)
- Firebase Cloud Functions (optional, for triggers)

### 1.2 Frontend Auth Layer

**New files:**
```
lib/
├── firebase.js             # Firebase SDK initialization
├── auth.js                 # Auth state management (sign in, sign up, sign out, listeners)
└── authContext.js           # React Context provider for auth state
```

**Auth flow:**
1. App launches → check `firebase.auth().currentUser`
2. If no user → show Auth screen (new `app/auth.js`)
3. If user exists but no profile → route to onboarding
4. If user + profile → route to tabs
5. Auth state listener updates context on sign-in/sign-out

**Dependencies to add (frontend):**
```json
{
  "@react-native-firebase/app": "latest",
  "@react-native-firebase/auth": "latest",
  "@react-native-firebase/firestore": "latest",
  "@react-native-firebase/storage": "latest"
}
```

### 1.3 Backend Auth Middleware

**New file:** `server/middleware/auth.js`

```
// Verifies Firebase ID token on every request
// Extracts uid, email, displayName from token
// Attaches user object to req.user
// Returns 401 for missing/invalid tokens
```

**All API routes become user-scoped:**
- `req.user.uid` used as the primary key for all data operations
- No anonymous API access (except health check)

**Dependencies to add (backend):**
```json
{
  "firebase-admin": "latest"
}
```

### 1.4 Navigation Updates

**Updated `app/_layout.js`:**
- Wrap app in `<AuthProvider>`
- Auth state determines initial route

**New `app/auth.js`:**
- Sign-in / Sign-up screen
- Email/password + Google + Apple providers
- Matches existing dark theme with lime accent

**Updated `app/index.js`:**
- Check auth state first, then onboarding status

---

## Phase 2: Cloud Database (Firestore) + Local SQLite Cache

### 2.1 Firestore Schema

```
users/{uid}/
├── profile                          # User profile document
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

## Phase 3: Backend Refactoring for Autonomy

### 3.1 New Backend Architecture

```
server/
├── index.js                    # Express app entry (updated)
├── package.json                # Updated dependencies
├── Dockerfile                  # Updated for new deps
│
├── middleware/
│   ├── auth.js                 # Firebase token verification
│   ├── rateLimit.js            # Per-user rate limiting
│   └── errorHandler.js         # Centralized error handling
│
├── routes/
│   ├── agent.js                # Real-time coaching (existing, add auth)
│   ├── onboarding.js           # Plan generation (existing, add auth + Firestore save)
│   ├── progress.js             # Analytics (existing, add auth + read from Firestore)
│   ├── programmer.js           # Plan regeneration (existing, add auth)
│   ├── exercises.js            # NEW: Exercise library CRUD
│   ├── locations.js            # NEW: Shared location management
│   ├── social.js               # NEW: Social features (feed, friends, sharing)
│   └── competitions.js         # NEW: Competition management
│
├── services/
│   ├── firestore.js            # Firestore admin client
│   ├── storage.js              # Cloud Storage for media
│   ├── scheduler.js            # Background job scheduler
│   └── notifications.js        # Push notification service
│
├── jobs/                       # Background jobs (run independently of device)
│   ├── planAdjuster.js         # Periodic plan optimization based on progress
│   ├── progressAnalyzer.js     # Weekly/monthly progress reports
│   ├── streakChecker.js        # Daily streak maintenance & notifications
│   ├── competitionScorer.js    # Real-time competition leaderboard updates
│   └── feedGenerator.js        # Generate social feed entries from user activity
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

### 3.2 Background Job System

**Purpose:** Enable AI tasks to run independently of the device.

**Implementation:** Use Cloud Scheduler (GCP) or a simple cron-based job runner within the Express app.

**Job: Plan Adjuster** (`jobs/planAdjuster.js`)
```
Trigger: After every 7 completed sessions, or weekly (whichever comes first)
Input:  User's workout history, current plan, profile (from Firestore)
Process:
  1. Query Firestore for user's recent sessions and sets
  2. Analyze progressive overload adherence
  3. Detect plateaus (3+ sessions with no weight/rep increase)
  4. Call Planning Agent with full context
  5. Generate adjusted plan
  6. Save new plan version to Firestore
  7. Send push notification: "Your plan has been updated based on your progress"
Output: New plan version in Firestore, notification sent
```

**Job: Progress Analyzer** (`jobs/progressAnalyzer.js`)
```
Trigger: Weekly (Sunday evening)
Input:  User's week of workout data (from Firestore)
Process:
  1. Calculate weekly volume, frequency, PRs
  2. Compare to previous weeks
  3. Generate AI insight via Gemini
  4. Store insight in Firestore (users/{uid}/insights/{weekId})
  5. Send push notification with highlight
Output: Weekly insight document, notification
```

**Job: Streak Checker** (`jobs/streakChecker.js`)
```
Trigger: Daily at 9 PM user's local time
Input:  User's session history
Process:
  1. Check if user has worked out today (based on schedule)
  2. If streak at risk, send reminder notification
  3. If streak broken, update streak counter
  4. If milestone reached (7, 30, 100 days), generate celebration
Output: Streak update, conditional notification
```

**Job: Competition Scorer** (`jobs/competitionScorer.js`)
```
Trigger: Real-time (Firestore trigger on session completion) + hourly batch
Process:
  1. On session complete, recalculate user's competition scores
  2. Update leaderboard in competition document
  3. Check for position changes → notify affected users
  4. On competition end, determine winners and generate results
```

### 3.3 API Route Changes

**All existing routes gain:**
- `auth` middleware (token verification)
- User-scoped data access via `req.user.uid`
- Firestore read/write instead of expecting client-sent data

**New route: `/api/exercises`**
```
GET    /api/exercises              # List exercises (paginated, filterable)
GET    /api/exercises/:id          # Get exercise detail with media URLs
GET    /api/exercises/search?q=    # Full-text search
```

**New route: `/api/locations`**
```
GET    /api/locations/nearby?lat=&lng=  # Find shared locations near coordinates
POST   /api/locations/shared            # Create shared location
PUT    /api/locations/shared/:id        # Update shared location (contributors only)
GET    /api/locations/shared/:id        # Get shared location detail
POST   /api/locations/shared/:id/claim  # Claim/link shared location to user profile
```

**New route: `/api/social`**
```
GET    /api/social/feed                 # Get social feed (friends + public)
POST   /api/social/share                # Share a workout/PR/achievement
POST   /api/social/like/:postId         # Like a post
GET    /api/social/friends              # List friends
POST   /api/social/friends/request      # Send friend request
PUT    /api/social/friends/:uid/accept  # Accept friend request
DELETE /api/social/friends/:uid         # Remove friend
```

**New route: `/api/competitions`**
```
GET    /api/competitions                # List active/upcoming competitions
POST   /api/competitions                # Create competition
GET    /api/competitions/:id            # Get competition detail + leaderboard
POST   /api/competitions/:id/join       # Join competition
GET    /api/competitions/:id/leaderboard # Real-time leaderboard
POST   /api/competitions/join/:code     # Join via invite code
```

---

## Phase 4: Exercise Library & Media

### 4.1 Cloud Storage Structure

```
gs://aura-fitness-media/
├── exercises/
│   ├── images/
│   │   ├── barbell-bench-press.webp         # Static form image
│   │   ├── barbell-squat.webp
│   │   └── ...
│   ├── gifs/
│   │   ├── barbell-bench-press.gif          # Animated demo
│   │   ├── barbell-squat.gif
│   │   └── ...
│   └── thumbnails/
│       ├── barbell-bench-press-thumb.webp   # 150x150 thumbnail
│       └── ...
├── avatars/
│   └── {uid}/
│       └── profile.webp                     # User avatar
└── social/
    └── {postId}/
        └── media.webp                       # Shared images
```

### 4.2 Exercise Data Seeding

**Seed script:** `server/scripts/seedExercises.js`

- Parse a curated exercise dataset (300+ exercises)
- Upload images/GIFs to Cloud Storage
- Create Firestore documents in `exercises/` collection
- Categories: Push, Pull, Legs, Core, Cardio, Flexibility
- Equipment tags: barbell, dumbbell, cable, machine, bodyweight, bands, kettlebell

**Data sources (to curate):**
- Open-source exercise databases (e.g., wger.de API, ExerciseDB)
- Custom photography/GIFs for key compound movements
- AI-generated form illustrations via Visual Agent (supplement gaps)

### 4.3 Frontend Exercise Browser

**New screen:** `app/exercises.js`
- Searchable, filterable exercise catalog
- Filter by: muscle group, equipment, difficulty
- Each exercise shows: name, thumbnail, primary muscles, equipment needed
- Tap for detail: full image/GIF, instructions, tips, alternatives

**Integration with existing features:**
- Exercise swap widget pulls from exercise library instead of AI-only suggestions
- Onboarding assessment references canonical exercise IDs
- Workout screen shows exercise media inline

---

## Phase 5: Shared Equipment Database

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

## Phase 7: Infrastructure & DevOps

### 7.1 Environment Configuration

```
.env.development
.env.staging
.env.production
```

**Required variables:**
```
# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_STORAGE_BUCKET=

# Backend
GEMINI_API_KEY=
PORT=8080
NODE_ENV=production

# Push Notifications
EXPO_PUSH_TOKEN=

# Feature Flags
ENABLE_SOCIAL=true
ENABLE_COMPETITIONS=true
```

### 7.2 Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // User data: only owner can read/write
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // Exercise library: any authenticated user can read, admin can write
    match /exercises/{exerciseId} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.admin == true;
    }

    // Shared locations: authenticated users can read, contributors can write
    match /sharedLocations/{locationId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null
        && request.auth.uid in resource.data.contributors;
    }

    // Social feed: visibility-based access
    match /feed/{postId} {
      allow read: if request.auth != null
        && (resource.data.visibility == 'public'
            || resource.data.authorUid == request.auth.uid
            || request.auth.uid in resource.data.visibleTo);
      allow create: if request.auth != null
        && request.resource.data.authorUid == request.auth.uid;
      allow delete: if request.auth != null
        && resource.data.authorUid == request.auth.uid;
    }

    // Competitions: authenticated users can read public, participants can update scores
    match /competitions/{compId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      match /participants/{uid} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

### 7.3 Cloud Run Updates

**Updated `server/Dockerfile`:**
```dockerfile
FROM node:20-slim
WORKDIR /app

# Install firebase-admin and other new deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy service account key (injected via Cloud Run secrets)
COPY . .

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "index.js"]
```

**Cloud Run configuration:**
- Min instances: 1 (avoid cold starts)
- Max instances: 10 (scale with users)
- Memory: 512MB → 1GB (for AI + Firestore operations)
- CPU: 1 → 2 (for background job processing)
- Secrets: Firebase service account, Gemini API key
- Cloud Scheduler: Triggers for background jobs via HTTP endpoints

### 7.4 Monitoring & Observability

- **Structured logging**: JSON logs with user context (uid, request ID)
- **Error tracking**: Integrate Sentry or Cloud Error Reporting
- **Performance**: Cloud Run metrics + custom latency tracking per agent
- **Alerts**: Slack/email alerts for error rate spikes, high latency, job failures

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

**Critical path:** Phase 1 → Phase 2 → Phase 3 (each depends on the previous).
Phases 4, 5, 6 can begin after Phase 2 is complete and can be developed in parallel.

---

## Migration Strategy

### Existing User Data Migration

Since there's no current auth system or cloud database, migration is straightforward:

1. **First-time cloud user**: On first sign-in, check Firestore for existing data
2. **Local data upload**: Prompt user to "Upload your existing workout data to the cloud"
3. **One-time sync**: Push all SQLite data to Firestore, mark as synced
4. **Ongoing**: Write-through sync handles all future data

### API Versioning

- Prefix all new routes with `/api/v2/`
- Keep existing `/api/` routes functional during transition
- Frontend switches to v2 routes after auth integration
- Deprecate v1 routes after full migration

---

## File Change Summary

### New Files
| File | Purpose |
|------|---------|
| `lib/firebase.js` | Firebase SDK initialization |
| `lib/auth.js` | Auth state management |
| `lib/authContext.js` | React Context for auth |
| `lib/sync.js` | SQLite ↔ Firestore sync layer |
| `lib/firestoreClient.js` | Firestore SDK wrapper |
| `app/auth.js` | Sign-in/sign-up screen |
| `app/exercises.js` | Exercise browser screen |
| `app/competition.js` | Competition detail screen |
| `app/(tabs)/social.js` | Social feed tab |
| `server/middleware/auth.js` | Firebase token verification |
| `server/middleware/rateLimit.js` | Per-user rate limiting |
| `server/middleware/errorHandler.js` | Centralized error handler |
| `server/services/firestore.js` | Admin Firestore client |
| `server/services/storage.js` | Cloud Storage service |
| `server/services/scheduler.js` | Background job scheduler |
| `server/services/notifications.js` | Push notification service |
| `server/routes/exercises.js` | Exercise library API |
| `server/routes/locations.js` | Shared locations API |
| `server/routes/social.js` | Social features API |
| `server/routes/competitions.js` | Competition API |
| `server/jobs/planAdjuster.js` | Background plan optimization |
| `server/jobs/progressAnalyzer.js` | Weekly progress reports |
| `server/jobs/streakChecker.js` | Streak maintenance |
| `server/jobs/competitionScorer.js` | Leaderboard updates |
| `server/jobs/feedGenerator.js` | Social feed generation |
| `server/scripts/seedExercises.js` | Exercise data seeder |
| `firestore.rules` | Security rules |
| `storage.rules` | Storage security rules |
| `firebase.json` | Firebase project config |

### Modified Files
| File | Changes |
|------|---------|
| `app/_layout.js` | Add AuthProvider wrapper |
| `app/index.js` | Auth state check before onboarding check |
| `app/onboarding.js` | Save to Firestore after local SQLite |
| `app/workout.js` | Pass auth token with API calls |
| `app/workout-summary.js` | Pass auth token with API calls |
| `app/locations.js` | Add shared location discovery |
| `app/(tabs)/_layout.js` | Add social tab |
| `app/(tabs)/index.js` | Pass auth token to coach API |
| `app/(tabs)/progress.js` | Pass auth token, add share buttons |
| `app/(tabs)/profile.js` | Add auth info, sign-out, avatar, friend list |
| `lib/database.js` | Add sync queue, write-through pattern |
| `lib/api.js` | Add auth header injection |
| `lib/contextBuilder.js` | Include exercise library references |
| `server/index.js` | Mount new routes, add middleware |
| `server/package.json` | Add firebase-admin, node-cron |
| `server/Dockerfile` | Update for new dependencies |
| `server/routes/agent.js` | Add auth middleware |
| `server/routes/onboarding.js` | Add auth, save plan to Firestore |
| `server/routes/progress.js` | Add auth, read from Firestore |
| `server/routes/programmer.js` | Add auth, save plan to Firestore |
| `package.json` | Add Firebase React Native dependencies |
| `app.json` | Add Firebase plugin configuration |
