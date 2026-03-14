# PRD v2: Multi-Agent Architecture Refactor

**Platform:** Mobile-First (iOS & Android)
**Status:** Draft
**Date:** 2026-03-13
**Supersedes:** PRD v1 (dual-model architecture)

---

## 1. Executive Summary

This PRD defines the refactoring of Aura from a dual-model architecture (Flash-Lite for chat, Pro for batch planning) into a **multi-agent system** with five specialized agents: Orchestrator, Planning, Memory/Context, Visual Generation, and Motivation Engine.

The current architecture has all AI logic embedded directly in route handlers with monolithic system prompts. The refactor introduces an **agent router** on the backend that dispatches user intent to the correct specialist agent, enabling faster responses, better reasoning, and new capabilities like image generation and location-aware equipment profiles.

### What Changes

| Current | New |
|---------|-----|
| 3 independent route handlers with inline AI calls | Centralized agent router with 5 specialized agents |
| Single `/api/coach` endpoint handles all chat | Orchestrator triages intent, delegates to specialist agents |
| No memory layer — context rebuilt per request | Dedicated Memory Agent with structured retrieval |
| No image generation | Visual Generation Agent for form checks & exercise demos |
| Motivation logic embedded in system prompts | Separate Motivation Engine with RPE-based decision matrix |
| Equipment is a single string field | Location-based equipment profiles |

### What Stays the Same

- React Native (Expo) frontend with SQLite local storage
- Express.js backend on Cloud Run
- Existing database tables (workout_sets, workout_sessions, etc.)
- Hybrid UI pattern (chat + structured inputs)
- Weight unit handling and progressive overload calculations
- Onboarding flow and plan generation

---

## 2. Multi-Agent Architecture

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND                       │
│  Chat UI ←→ Workout UI ←→ Progress UI           │
│         ↕            ↕           ↕               │
│              lib/api.js                          │
└──────────────────┬──────────────────────────────┘
                   │ POST /api/agent
                   ▼
┌──────────────────────────────────────────────────┐
│              AGENT ROUTER                         │
│         server/agents/router.js                   │
│                                                   │
│  Parses intent → selects agent(s) → combines     │
│  responses → returns unified payload              │
└──────┬───────┬───────┬───────┬───────┬───────────┘
       │       │       │       │       │
       ▼       ▼       ▼       ▼       ▼
   ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐
   │Orch. ││Plan. ││Memory││Visual││Motiv.│
   │Agent ││Agent ││Agent ││Agent ││Engine│
   └──────┘└──────┘└──────┘└──────┘└──────┘
```

### 2.1 Orchestrator Agent (Gemini 3 Flash)

**Purpose:** The user-facing conversational agent. Fastest model for sub-second chat responses.

**Responsibilities:**
- Parse user intent from natural language
- Handle simple queries directly (greetings, "ready for next set", quick encouragement)
- Route complex requests to specialist agents (plan changes, equipment swaps, data lookups)
- Compose final response from specialist agent outputs
- Maintain conversational tone and brevity (1-2 sentences mid-workout)

**Input:** User message + conversation history + current workout context
**Output:** `{ text, agentActions[], functionCall?, swapSuggestion? }`

**Routing Rules:**
| User Intent | Route To |
|-------------|----------|
| "Ready for next set" / general chat | Self (direct reply) |
| "Swap exercise" / "shoulder hurts" / plan modification | Planning Agent |
| "What did I lift last week?" / historical query | Memory Agent |
| "Show me proper form for deadlift" | Visual Agent |
| Set logged with RPE data | Motivation Engine |
| "I'm at home today" / location change | Memory Agent → Planning Agent |

### 2.2 Planning Agent (Gemini 3.1 Pro)

**Purpose:** Complex reasoning about workout programming, exercise selection, and progressive overload.

**Responsibilities:**
- Generate and modify workout plans based on constraints
- Calculate progressive overload adjustments
- Handle exercise swaps with biomechanical reasoning
- Adapt plans to equipment/location changes
- Detect plateaus and prescribe deload/variation strategies

**Input:** Structured context from Orchestrator + data from Memory Agent
**Output:** Structured JSON (plan modifications, swap suggestions, overload adjustments)

**Replaces:** Current `/api/programmer` route logic + complex swap logic from `/api/coach`

### 2.3 Memory Agent (RAG Layer)

**Purpose:** Structured data retrieval from SQLite. Prevents hallucination by grounding all agent decisions in real logged data.

**Responsibilities:**
- Query workout history (sets, weights, RPE trends)
- Retrieve location-specific equipment profiles
- Fetch progressive overload data for specific exercises
- Aggregate stats (weekly volume, PRs, streaks)
- Build context packages for other agents

**Input:** Structured query (exercise name, date range, location, metric type)
**Output:** Structured data payload (not natural language)

**Key Distinction:** This is NOT an LLM agent. It is a deterministic retrieval layer that wraps existing database functions (`getExerciseProgressionData`, `getRecentWorkoutHistory`, etc.) behind a unified query interface. The Orchestrator or Planning Agent calls it via internal function, not via AI.

### 2.4 Visual Generation Agent (Gemini 3.1 Flash Image)

**Purpose:** Generate contextual exercise images, form check visuals, and workout summary graphics.

**Responsibilities:**
- Generate exercise demonstration images on request
- Create form correction visuals based on user descriptions
- Produce shareable workout summary cards
- Generate equipment modification visuals (e.g., "band-assisted pullup alternative")

**Input:** Exercise name + context (equipment available, modification needed)
**Output:** Base64 image + optional text overlay description

### 2.5 Motivation Engine (Deterministic + System Prompt Layer)

**Purpose:** RPE-based coaching tone calibration. Determines *how* the Orchestrator should respond based on performance data.

**Responsibilities:**
- Analyze RPE input against goal-specific thresholds
- Determine coaching tone (push harder / maintain / ease off / deload)
- Generate weight adjustment suggestions
- Trigger celebration for PRs and milestones

**Decision Matrix:**

| RPE | Goal: Strength (target 8) | Goal: Hypertrophy (target 7) | Goal: Fat Loss (target 6) |
|-----|---------------------------|------------------------------|---------------------------|
| ≤5  | "Add 5kg next set" | "Add 2.5kg next set" | "Add 2.5kg, keep pace up" |
| 6   | "Add 2.5kg, you've got this" | "Perfect intensity, add 1.25kg" | "Right on target" |
| 7   | "Good working weight" | "Ideal RPE — stay here" | "Slightly heavy, hold weight" |
| 8   | "Right at target" | "Upper limit — hold or drop 2.5kg" | "Too heavy, drop 2.5kg" |
| 9   | "Near max — hold weight" | "Too hard, drop 5kg" | "Drop weight, focus on form" |
| 10  | "Max effort — deload next session" | "Way too heavy, drop 5-10kg" | "Stop, reassess weight" |

**Key Distinction:** This is primarily a deterministic rules engine with optional LLM enhancement for natural language phrasing. The RPE thresholds and weight adjustments are hardcoded, not AI-generated.

---

## 3. Data Schema Changes

### 3.1 New Table: `locations`

```sql
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- "Home Gym", "Planet Fitness Downtown"
  equipment_list TEXT NOT NULL,          -- JSON array: ["dumbbells_up_to_30kg", "pull_up_bar", "bench"]
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 3.2 New Table: `agent_interactions`

For debugging and analytics — logs which agents were invoked per user message.

```sql
CREATE TABLE IF NOT EXISTS agent_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  user_message TEXT,
  agents_invoked TEXT,                   -- JSON array: ["orchestrator", "memory", "planning"]
  orchestrator_latency_ms INTEGER,
  total_latency_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 3.3 Modified Table: `workout_sessions`

Add location tracking:

```sql
ALTER TABLE workout_sessions ADD COLUMN location_id INTEGER REFERENCES locations(id);
```

### 3.4 Modified Table: `workout_sets`

Add RPE to existing schema (already exists — no change needed).

### 3.5 New Table: `agent_context_cache`

Short-lived cache to avoid redundant Memory Agent queries within a session.

```sql
CREATE TABLE IF NOT EXISTS agent_context_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                   -- JSON payload
  expires_at TEXT NOT NULL
);
```

---

## 4. API Changes

### 4.1 New Unified Endpoint: `POST /api/agent`

Replaces direct calls to `/api/coach` for chat interactions. The agent router handles all intent-based routing.

**Request:**
```json
{
  "message": "My shoulder hurts, can we swap the overhead press?",
  "history": [...],
  "context": {
    "goal": "Build Muscle",
    "currentExercise": "Overhead Press",
    "currentDay": "Monday",
    "locationId": 2,
    "sessionId": 45,
    "workoutState": "active"
  }
}
```

**Response:**
```json
{
  "text": "No worries — I've got three alternatives that'll hit your shoulders without the impingement risk.",
  "agentsUsed": ["orchestrator", "memory", "planning"],
  "functionCall": null,
  "swapSuggestion": {
    "original": "Overhead Press",
    "alternatives": [
      { "name": "Landmine Press", "reason": "Shoulder-friendly arc", "is_recommended": true },
      { "name": "Cable Lateral Raise", "reason": "Isolation, no pressing", "is_recommended": false },
      { "name": "Arnold Press (light)", "reason": "Rotation reduces impingement", "is_recommended": false }
    ]
  },
  "image": null,
  "latency": { "orchestrator": 380, "memory": 45, "planning": 1200, "total": 1625 }
}
```

### 4.2 Preserved Endpoints

These remain unchanged for non-chat flows:

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `POST /api/onboarding` | Initial plan generation | Keep as-is |
| `POST /api/programmer/submit` | Async plan regeneration | Keep as-is (called by Planning Agent internally for batch) |
| `POST /api/progress/insights` | Analytics insights | Keep as-is |

### 4.3 New Endpoint: `POST /api/locations`

CRUD for location/equipment profiles.

```
POST   /api/locations          — Create location
GET    /api/locations          — List locations
PUT    /api/locations/:id      — Update location
DELETE /api/locations/:id      — Delete location
```

### 4.4 New Endpoint: `POST /api/agent/image`

Dedicated endpoint for image generation (separating from chat to allow independent loading).

**Request:**
```json
{
  "type": "exercise_demo",
  "exercise": "Romanian Deadlift",
  "equipment": "barbell",
  "modification": null
}
```

**Response:**
```json
{
  "imageUrl": "data:image/png;base64,...",
  "caption": "Romanian Deadlift — hinge at hips, slight knee bend, bar close to shins"
}
```

---

## 5. Frontend Changes

### 5.1 API Client Updates (`lib/api.js`)

- New `sendAgentMessage(message, history, context)` function replacing `sendCoachMessage`
- New `getLocations()`, `createLocation()`, `updateLocation()`, `deleteLocation()`
- New `generateExerciseImage(exercise, equipment, modification)`
- Deprecate `sendCoachMessage` (keep as fallback during migration)

### 5.2 Database Updates (`lib/database.js`)

- New CRUD functions for `locations` table
- New `saveAgentInteraction()` for debugging
- New `getAgentContextCache()` / `setAgentContextCache()` for session caching
- Modify `startSession()` to accept optional `locationId`

### 5.3 Chat Screen Updates (`app/(tabs)/index.js`)

- Replace `sendCoachMessage` calls with `sendAgentMessage`
- Add location selector (dropdown or GPS-based) before starting workout
- Handle new response shape (agentsUsed, image, latency)
- Display generated images inline in chat
- Add latency indicator (optional, for dev mode)

### 5.4 Workout Screen Updates (`app/workout.js`)

- Pass `locationId` to session start
- Agent-powered coaching uses new endpoint
- Display generated exercise images when available
- Motivation Engine suggestions replace current inline RPE logic

### 5.5 New Screen: Location Manager (`app/locations.js`)

- List saved locations with equipment profiles
- Add/edit location: name + equipment checklist
- Set default location
- Equipment list uses predefined categories with search

---

## 6. Milestones

Each milestone is scoped to be completable in a single coding session (2-4 hours). Milestones build on each other sequentially.

---

### Milestone 1: Agent Router Foundation ✅ COMPLETE (2026-03-14)

**Goal:** Create the backend agent infrastructure and unified endpoint without changing any AI behavior. The current coach logic moves into the Orchestrator agent unchanged.

**Status:** Implemented and verified. All modules load cleanly. Both endpoints call the same `handleMessage()`.

**Backend tasks:**
1. ✅ Create `server/agents/` directory structure:
   - `server/agents/types.js` — `AGENTS` enum, `buildAgentResponse()`, `logInteraction()` (structured JSON for Cloud Run)
   - `server/agents/orchestrator.js` — Extracted `handleMessage()` from `coach.js` (lines 5-168 → standalone async function)
   - `server/agents/router.js` — `routeRequest()` dispatches to orchestrator, tracks latency, logs via `logInteraction()`
2. ✅ Create `POST /api/agent` endpoint in `server/routes/agent.js` — validates `message` exists, delegates to router
3. ✅ Add `agent_interactions` table + `saveAgentInteraction()` export to `lib/database.js`
4. ✅ Wire up in `server/index.js` — `app.use('/api/agent', agentRouter)`

**Frontend tasks:**
5. ✅ Add `sendAgentMessage()` to `lib/api.js` — includes 90s abort timeout (matching `generatePlan` pattern)
6. ✅ Update `app/(tabs)/index.js` — try/catch with fallback to `sendCoachMessage`
7. ✅ Update `app/workout.js` — both inline chat (line 226) and fire-and-forget completion message (line 289) use agent with fallback
8. ✅ Update `app/workout-summary.js` — same try/fallback pattern (not in original PRD, discovered during implementation)

**Implementation discoveries:**
- `server/routes/coach.js` reduced from 172 lines to 16 lines (thin wrapper calling `orchestrator.handleMessage()`)
- `workout-summary.js` also calls `sendCoachMessage` (line 52) — added to scope since it was missed in original PRD
- Agent response is a superset: adds `agentsUsed` and `latency` fields. Frontend callers only destructure `text`, `functionCall`, `swapSuggestion` so extra fields are safely ignored
- Server-side interaction logging uses `process.nextTick()` + `console.log(JSON.stringify(...))` for non-blocking structured logging (Cloud Run parses JSON logs automatically)
- `sendAgentMessage` uses 90s AbortController timeout (matching existing `generatePlan` pattern), while `sendCoachMessage` has no timeout — this is intentional as the agent endpoint may orchestrate multiple agents in future milestones

**Validation:**
- ✅ All server modules load without error (`node -e "require('./server/agents/...')"`)
- ✅ Old `/api/coach` endpoint still works (thin wrapper, same `handleMessage()`)
- ✅ New `/api/agent` endpoint returns superset response with `agentsUsed` and `latency`
- ✅ Frontend falls back transparently if `/api/agent` is unavailable
- ✅ `agent_interactions` table created in SQLite on app launch

**No AI behavior changes in this milestone.**

---

### Milestone 2: Memory Agent & Context Layer ✅ COMPLETE (2026-03-14)

**Goal:** Extract context normalization into a dedicated Memory Agent module and unify the 4 different frontend context shapes into a single builder. Add locations/equipment database infrastructure.

**Status:** Implemented and verified. All modules load cleanly. System prompt output is identical for the same input context.

**Architectural decision:** The Memory Agent is a **deterministic context normalization layer** (not a DB query wrapper). Since all data lives in client-side SQLite and the server is 100% stateless (Express on Cloud Run, no DB), the Memory Agent normalizes the 4 different frontend context shapes into a single canonical shape. Server-side `/api/locations` CRUD routes were **deferred** — location CRUD lives entirely in frontend SQLite since the server has no persistent storage.

**Backend tasks:**
1. ✅ Created `server/agents/memory.js`:
   - `buildAgentContext(userContext)` — normalizes 4 frontend context shapes into canonical shape with `user`, `workout`, `location`, `progression`, `plan`, `completion` fields
   - `formatContextBlock(agentContext)` — extracts "Current Context:" text block generation from orchestrator (was lines 6-22)
   - `formatCompletionDirective(agentContext)` — extracts workout-complete directive from orchestrator (was lines 24-33)
2. ✅ Added `locations` table, `agent_context_cache` table, and `workout_sessions.location_id` migration to `lib/database.js`
3. ⏭️ Skipped `POST /api/locations` routes — server has no DB, location CRUD lives in frontend SQLite only. Deferred to future milestone if server-side persistence is added.
4. ✅ Added 7 location CRUD functions to `lib/database.js`: `saveLocation`, `getLocations`, `getLocation`, `updateLocation`, `deleteLocation`, `getDefaultLocation`, `setDefaultLocation`
5. ✅ Refactored `server/agents/orchestrator.js` — imports memory agent, `handleMessage()` calls `buildAgentContext()` first, `buildSystemPrompt()` uses `formatContextBlock()` and `formatCompletionDirective()` instead of inline logic

**Frontend tasks:**
6. ⏭️ Skipped location API functions in `lib/api.js` — no server routes to call (see #3)
7. ✅ Location CRUD functions added to `lib/database.js` (see #4)
8. ✅ Created `lib/contextBuilder.js` with `buildUserContext()` — unified context builder replaces 4 copy-pasted context objects across 3 files
9. ✅ Updated `app/(tabs)/index.js` — uses `buildUserContext()` instead of inline context
10. ✅ Updated `app/workout.js` — uses `buildUserContext()` for chat context, workout-complete context, and passes `locationId` to `startSession()`
11. ✅ Updated `app/workout-summary.js` — uses `buildUserContext()` instead of inline context
12. ✅ Updated `server/agents/router.js` — `agentsUsed` now includes `["orchestrator", "memory"]`, latency tracks `memory` field

**Implementation discoveries:**
- The 4 different frontend context shapes were: (1) chat screen with progression, (2) workout chat with exercise details, (3) workout complete with stats, (4) workout summary with plan. All had slightly different field names and structures.
- `buildUserContext()` output is backward-compatible with the server — it produces the same flat field names (`goal`, `equipment`, `currentDay`, `currentExercise`, `workoutComplete`, etc.) that `buildAgentContext()` then normalizes into the canonical nested shape.
- The `formatContextBlock()` and `formatCompletionDirective()` functions produce byte-identical output to the old inline logic in `buildSystemPrompt()` — verified with direct comparison tests.
- `orchestrator.js` went from 165 lines to ~130 lines — the system prompt builder is now 3 lines instead of 28.
- Location equipment resolution (from location vs profile) happens in `buildUserContext()` on the frontend, giving the server a single `equipment` field regardless of source.

**Validation:**
- ✅ All 3 server modules load without error (`node -e "require('./server/agents/...')"`)
- ✅ Agent response includes `agentsUsed: ["orchestrator", "memory"]` and `latency: { memory, orchestrator, total }`
- ✅ System prompt text output is identical for the same input context (byte-level verification)
- ✅ New tables (`locations`, `agent_context_cache`) created on app launch
- ✅ `workout_sessions.location_id` migration runs cleanly on existing DB
- ✅ Location CRUD functions work: `saveLocation` → `getLocations` → `deleteLocation`
- ✅ `startSession(planDay, focus, locationId)` stores `location_id`
- ✅ Old `/api/coach` endpoint still works (thin wrapper unchanged)
- ✅ All 3 frontend screens use unified `buildUserContext()` — no inline context construction remains

**No AI behavior changes in this milestone.**

---

### Milestone 3: Location Manager UI ✅ COMPLETE (2026-03-14)

**Goal:** Build the location management screen and integrate location selection into the workout flow.

**Status:** Implemented and verified. Location Manager screen created, location selection wired into full workout flow (chat → summary → workout), onboarding creates initial location, and agent context includes location info in system prompt.

**Frontend tasks:**
1. ✅ Created `app/locations.js` — Full CRUD Location Manager screen:
   - List saved locations as cards with equipment summaries and default badge
   - Add/edit via bottom sheet Modal with name input + categorized equipment checklist (3 categories: Free Weights, Machines, Bodyweight & Other — 16 equipment items total)
   - Delete with confirmation Alert
   - Set default location toggle
   - Empty state with guidance text
2. ✅ Added navigation to Location Manager from Profile tab (`app/(tabs)/profile.js`):
   - New "Locations" row between Equipment and dev reset button
   - Shows count (e.g. "3 saved") with chevron-right arrow
   - Loads location count on mount via `getLocations()`
3. ✅ Added location selector to Chat screen (`app/(tabs)/index.js`):
   - Compact inline picker in WorkoutCard (above "Start Workout" button)
   - Shows current location name with location-on icon and unfold-more icon
   - Tapping cycles through saved locations
   - If no locations, tapping navigates to `/locations`
   - Loads locations + default location on mount
   - Passes `locationJson` to workout-summary params
   - Passes `location` to `buildUserContext()` in `handleSend`
4. ✅ Updated `app/workout.js`:
   - Parses `locationJson` from route params
   - Passes `location.id` to `startSession()` (was `null`)
   - Shows location name in header subtitle (e.g. "SET 1 OF 4 · Planet Fitness")
   - Passes `location` to all 3 `buildUserContext()` calls (chat, workout-complete)
5. ✅ Updated onboarding flow (`app/onboarding.js`):
   - Added new `locationName` step between equipment and bodyStats
   - Simple TextInput defaulting to "My Gym"
   - Equipment ID mapping: `commercial_gym` → 14 items, `home_gym` → 3 items, `bodyweight_only` → 1 item
   - Calls `saveLocation(name, equipmentList, true)` in `handleFinishAssessment`
6. ✅ Updated `app/workout-summary.js`:
   - Receives and parses `locationJson` from route params
   - Passes `location` to `buildUserContext()` for AI context
   - Forwards `locationJson` when navigating to workout screen

**Backend tasks:**
7. ✅ Updated `lib/contextBuilder.js` — Added `locationName: location?.name || null` to output; fixed `equipment_list` handling to support both pre-parsed arrays and JSON strings
8. ✅ Updated `server/agents/memory.js` — `formatContextBlock()` now includes location line: `- Location: {name} (Equipment: {list})` when location data is present

**Implementation discoveries:**
- Location selector uses cycle-through pattern (tap to advance) rather than dropdown/bottom sheet — simpler, no extra library needed, consistent with the compact WorkoutCard layout
- `getLocations()` and `getDefaultLocation()` in `lib/database.js` already parse `equipment_list` from JSON string to array, so `contextBuilder.js` needed a guard (`Array.isArray` check) to avoid double-parsing — this was a latent bug in the Milestone 2 code that only surfaced now that locations are actually being passed
- `workout-summary.js` also needed location integration (receives and forwards `locationJson`) — same pattern as the Milestone 1 discovery where this screen was initially missed
- Equipment mapping for onboarding: `commercial_gym` maps to the full 14-item set from the EQUIPMENT_CATEGORIES constant, `home_gym` to `["dumbbells", "bench", "resistance_bands"]`, `bodyweight_only` to `["pull_up_bar"]`
- The location is forwarded through the flow as serialized JSON in route params (`locationJson`), consistent with the existing `dayJson` pattern
- `memory.js` `formatContextBlock()` now destructures `location` alongside `user, workout, progression, plan` and conditionally appends the location line — only when `location.name` is present, so old flows without location still work

**Validation:**
- ✅ `app/locations.js` renders, creates, edits, deletes locations with equipment profiles
- ✅ Profile screen shows "Locations" row with count, navigates to `/locations`
- ✅ Onboarding creates initial default location with equipment mapping on plan generation
- ✅ Chat screen shows location selector in WorkoutCard; cycling through locations works
- ✅ Selected location flows: chat → workout-summary → workout screen
- ✅ Workout screen header shows location name (e.g. "SET 1 OF 4 · My Gym")
- ✅ `startSession()` receives non-null `locationId` when location is selected
- ✅ Agent context includes location info in "Current Context:" block
- ✅ Old flows still work if no location is selected (null fallback throughout)
- ✅ Metro bundler compiles all files without errors (verified via `expo export`)

---

### Milestone 4: Planning Agent ✅ COMPLETE (2026-03-14)

**Goal:** Extract complex reasoning (plan modification, exercise swaps, progressive overload calculations) into a dedicated Planning Agent that uses Gemini 2.5 Pro for biomechanical reasoning.

**Status:** Implemented and verified. Planning Agent created with 3 handlers, intent classification added to router, all modules load cleanly. Intent classifier passes 12/12 test cases. Orchestrator's `suggest_swap` function calling retained as fallback.

**Architectural decision:** Intent classification lives in the **router** (not the orchestrator), keeping the orchestrator as a pure LLM wrapper. The router calls `classifyIntent()` (<1ms keyword matching) before dispatching — planning intents go directly to the Planning Agent with context from `buildAgentContext()`, bypassing the orchestrator entirely. This avoids a double-LLM-call for planning requests. If the Planning Agent fails (timeout/error), the router falls through to the orchestrator, which still has `suggest_swap` function calling as a safety net.

**Backend tasks:**
1. ✅ Created `server/agents/planning.js` — 3 exported handlers, all using Gemini 2.5 Pro with `responseMimeType: 'application/json'`:
   - `handleSwapRequest(message, agentContext)` — Generates 3 alternatives with biomechanical descriptions (muscle targets, movement patterns, injury considerations). Same `swapSuggestion` shape as orchestrator for backward compatibility with `SwapExerciseWidget`.
   - `handlePlanModification(message, agentContext)` — Handles workout-level changes ("make today lighter", "I'm at home"). Returns `planModification: { modifiedExercises: [{ original, replacement, reason }] }`.
   - `handleProgressiveOverload(message, agentContext)` — Advises on weight progression using RPE-based rules (copied from `programmer.js` lines 12-20). Returns `overloadSuggestion: { exercise, currentWeight, suggestedWeight, weightUnit, reason }`.
   - System prompt includes: exercise physiology identity, muscle group taxonomy (push/pull/legs with primary/secondary movers), progressive overload rules, injury awareness guidelines (shoulder impingement, lower back, knee, wrist alternatives), equipment-exercise compatibility
   - Helper `buildPlanningPrompt(message, agentContext)` assembles user context into structured prompt
2. ✅ Updated `server/agents/router.js` — Added `classifyIntent(message)` and planning dispatch:
   - `classifyIntent()` — keyword-based classifier (<1ms), returns `'swap'` | `'plan_modify'` | `'overload'` | `'chat'`
   - Swap keywords: swap, replace, alternative, substitute, switch exercise, different exercise, can't do, hurts, injured, injury, pain
   - Plan modification keywords: modify plan, change plan, easier/harder workout, lighter/heavier today, at home, no equipment
   - Overload keywords: go heavier, increase weight, add weight, weight progression, ready for more, should i increase
   - Planning path: `classifyIntent()` → `buildAgentContext()` → planning handler → `buildAgentResponse()` with `agentsUsed: ['orchestrator', 'memory', 'planning']`
   - Try/catch around planning calls — on failure, falls through to orchestrator path
   - `classifyIntent` exported for testing
3. ✅ Updated `server/agents/types.js`:
   - Added `planningLatencyMs` to `logInteraction()` (optional field, backward-compatible)
   - Added `planModification` and `overloadSuggestion` fields to `buildAgentResponse()` (both default to `null`)
4. ✅ Updated `lib/contextBuilder.js` — Added `locationEquipment` field so location equipment propagates through canonical context to `memory.js`'s `location.equipmentList` field
5. ⏭️ Orchestrator NOT modified — `suggest_swap` function declaration intentionally retained as fallback for swap requests the intent classifier misses. No intent classification in orchestrator (lives in router instead).

**Frontend tasks:**
6. ⏭️ No frontend changes required — `SwapExerciseWidget` already renders the same `swapSuggestion` shape. Richer `description` text from Planning Agent displays automatically. New response fields (`planModification`, `overloadSuggestion`) are safely ignored by existing frontend code until future milestones add UI for them.

**Implementation discoveries:**
- Intent classification is in the router rather than the orchestrator (diverges from original PRD task #2). This is better because: (a) it avoids a wasted Flash-Lite call for planning requests, (b) keeps orchestrator as a pure conversational agent, (c) makes fallback logic simpler (just catch and fall through to orchestrator path).
- The Planning Agent uses `responseMimeType: 'application/json'` (same pattern as `programmer.js`) rather than function calling. This gives more control over output schema and avoids the function-calling round-trip overhead.
- `buildAgentContext()` from `memory.js` is called directly by the router for planning requests, proving the Memory Agent's value as a reusable context normalization layer — both the orchestrator and planning paths use it independently.
- The `swapSuggestion` shape is fully backward-compatible: same `{ original_exercise, reason, alternatives: [{ name, description, is_recommended }] }` structure. The only difference is richer `description` text (biomechanical reasoning vs. brief one-liners from Flash-Lite).
- `planModification` and `overloadSuggestion` are new response fields that existing frontend code safely ignores. They'll need UI components in a future milestone to surface plan-level changes and weight suggestions from the Planning Agent.
- `lib/contextBuilder.js` had a latent gap: `locationEquipment` was never sent to the server, so `memory.js`'s `location.equipmentList` was always null. Fixed by adding `locationEquipment` field alongside `locationId` and `locationName`. The Planning Agent reads equipment from `user.equipment` (which already works via location-aware resolution in `buildUserContext()`), but this fix makes the canonical context complete for all agents.
- Progressive overload rules in the Planning Agent system prompt are copied from `programmer.js` (lines 12-20) to maintain consistency: same RPE thresholds, same weight increments per goal, same plateau detection criteria.
- The `"make today lighter"` test case initially failed because the keyword list had `"lighter today"` but not `"today lighter"` or `"make today"`. Added additional keyword variations to catch natural phrasings like "make today lighter/easier/heavier".

**Validation:**
- ✅ All 4 server modules load without error (`node -e "require('./server/agents/...')"`)
- ✅ Intent classification: 12/12 test cases pass (swap ×4, plan_modify ×3, overload ×3, chat ×3 — including edge cases like "my shoulder hurts" → swap, "let's go!" → chat)
- ✅ `buildAgentResponse()` correctly includes `planModification` and `overloadSuggestion` fields
- ✅ `logInteraction()` accepts and logs `planningLatencyMs`
- ✅ Planning path: `classifyIntent` → `buildAgentContext` → planning handler → `buildAgentResponse` with `agentsUsed: ['orchestrator', 'memory', 'planning']`
- ✅ Chat path: unchanged, `agentsUsed: ['orchestrator', 'memory']`, no planning latency
- ✅ Orchestrator's `suggest_swap` function calling still works as fallback (orchestrator.js unchanged)
- ✅ `lib/contextBuilder.js` now includes `locationEquipment` field

---

### Milestone 5: Motivation Engine ✅ COMPLETE (2026-03-14)

**Goal:** Extract RPE-based coaching logic into a deterministic Motivation Engine that shapes the Orchestrator's tone and suggestions.

**Status:** Implemented and verified. Motivation Engine created with RPE decision matrix from PRD section 2.5, integrated into both server (router + orchestrator) and client (workout.js handleDone flow). Celebration banner with haptic feedback added. All 5 server agent modules load cleanly. `expo export --platform ios` compiles without errors.

**Architectural decision:** The Motivation Engine is implemented as **two parallel modules** — `server/agents/motivation.js` (CommonJS) and `lib/motivation.js` (ESM) — because the server is 100% stateless on Cloud Run while all workout data lives in client-side SQLite. The client-side module is the **primary evaluation path** for the DONE button flow (instant feedback, no server round-trip). The server-side module evaluates after orchestrator `log_set` function calls in chat flow to shape LLM response tone. Both share the same RPE decision matrix logic (duplicated due to CommonJS vs ESM module systems).

**Backend tasks:**
1. ✅ Created `server/agents/motivation.js` (CommonJS):
   - `evaluateSet({ rpe, goal, currentWeight, weightUnit, exerciseName })` — Returns coaching directive with `tone` ('push'|'maintain'|'ease'|'deload'), `weightAdjustment` ({ value, unit, direction } or null), `messageHint` (natural language string), `celebration` (null, set by checkMilestone separately)
   - `checkMilestone({ currentWeight, exerciseMaxWeight, streakData, completedSessions })` — Detects weight PRs, streak milestones (3, 5, 7, 10, 14, 21, 30 days), session milestones (10, 25, 50, 100)
   - `buildMotivationDirective(evaluation, milestone)` — Formats tone + messageHint + celebration into a `MOTIVATION DIRECTIVE:` block for system prompt injection
   - `normalizeGoal(goalString)` — Maps user goal strings ("Increase Strength", "Build Muscle", etc.) to matrix keys ('strength'|'hypertrophy'|'fat_loss')
   - `RPE_MATRIX` — Hardcoded decision matrix from PRD section 2.5 with 6 thresholds per goal (3 goals × 6 RPE ranges = 18 entries)
2. ✅ Updated `server/agents/orchestrator.js`:
   - Replaced directive #6 ("Weight Progression: If the Progression Status...") with motivation-aware directive: "After a set is logged, the Motivation Engine provides coaching tone. Follow its directive for weight suggestions and encouragement."
   - After `log_set` function call is detected, calls `evaluateSet()` and injects `coaching_hint` into the function response so the LLM's follow-up text is shaped by the Motivation Engine's tone
3. ✅ Updated `server/agents/router.js`:
   - After orchestrator returns with `functionCall` (log_set detected): extracts `rpe`, `weight`, `weight_unit`, `exercise_id` from function call args, calls `evaluateSet()` with agent context goal, optionally calls `checkMilestone()` if motivation context available, attaches `motivationDirective` to `buildAgentResponse()`, adds `AGENTS.motivation` to `agentsUsed`, tracks `motivationLatencyMs`
4. ✅ Updated `server/agents/types.js`:
   - Added `motivationDirective` field (default `null`) to `buildAgentResponse()` return object
   - Added `motivationLatencyMs` (optional) to `logInteraction()` entry
5. ✅ Updated `server/agents/memory.js` — Added `motivation` context normalization: `{ exerciseMaxWeight, streakData, completedSessions }` from frontend context
6. ✅ Updated `lib/contextBuilder.js` — Added optional `motivation` parameter to `buildUserContext()`, passes `exerciseMaxWeight`, `streakData`, `completedSessions` through to server

**Frontend tasks:**
7. ✅ Created `lib/motivation.js` (ESM) — Client-side mirror of server module exporting `evaluateSet()`, `checkMilestone()`, `normalizeGoal()`, same `RPE_MATRIX`. No `buildMotivationDirective` (server-only for system prompt injection).
8. ✅ Added `getExerciseMaxWeight(exerciseName)` to `lib/database.js` — `SELECT MAX(weight normalized to kg) FROM workout_sets WHERE exercise_name = ?`
9. ✅ Updated `app/workout.js` — Primary frontend integration:
   - Replaced inline RPE threshold logic (old lines 252-276: hardcoded pushThreshold, lower body keyword list, manual increment calculation) with `evaluateSet()` + `checkMilestone()` from `lib/motivation.js`
   - Added celebration state (`useState(null)`) and celebration banner UI: temporary lime-green overlay below header with trophy icon (`MaterialIcons name="emoji-events"`), auto-dismiss after 3 seconds
   - Added haptic feedback on milestone: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`
   - Auto-bumps weight for next set when `evaluation.tone === 'push'` and `evaluation.weightAdjustment` exists
   - Loads milestone data on exercise change: `getExerciseMaxWeight()`, `getWorkoutStreak()`, `getCompletedSessionCount()` in parallel via `Promise.all()`
   - Passes motivation context (`{ exerciseMaxWeight, streakData, completedSessions }`) to all `buildUserContext()` calls

**Implementation discoveries:**
- The RPE decision matrix is structured as an array of threshold objects per goal, where each entry has `maxRpe` — the first entry where `roundedRpe <= maxRpe` matches. This is simpler than the switch/case approach and makes it trivial to add new goals or adjust thresholds.
- The `evaluateSet()` signature differs from the original PRD (`evaluateSet(rpe, goal, exerciseHistory)` → `evaluateSet({ rpe, goal, currentWeight, weightUnit, exerciseName })`). Named parameters are clearer and `exerciseHistory` was unnecessary — the decision matrix is purely RPE-based with no historical lookups needed (history is already factored into the RPE rating by the user).
- The client-side module doesn't need `buildMotivationDirective()` since it never constructs system prompts. Keeping it server-only avoids dead code in the mobile bundle.
- Weight PR detection compares current set weight against `getExerciseMaxWeight()` (all-time max normalized to kg). This means a PR is detected even if the user switches units between sessions.
- The celebration banner uses a simple `setTimeout(() => setCelebration(null), 3000)` for auto-dismiss rather than Animated API — keeps it lightweight and avoids animation complexity for a temporary notification.
- Milestone data (`exerciseMaxWeight`, `streakData`, `completedSessions`) is loaded in the exercise-change `useEffect` alongside progression data, using `Promise.all()` for parallel fetches. This adds ~0ms overhead since SQLite queries are local and fast.
- The orchestrator injects `coaching_hint` into the `log_set` function response (not the system prompt). This is more effective because the LLM sees the hint as contextual data about the set just logged, naturally incorporating the tone into its follow-up message.
- The server-side motivation evaluation in `router.js` runs **after** the orchestrator returns (post-hoc), while the orchestrator's own evaluation runs **during** the function call round-trip. Both use the same `evaluateSet()` function but serve different purposes: the orchestrator's shapes the LLM text, the router's produces a structured `motivationDirective` field in the API response for frontend consumption.

**Validation:**
- ✅ `node -e "require('./server/agents/motivation')"` loads without error
- ✅ `evaluateSet({ rpe: 5, goal: 'Increase Strength' })` → `{ tone: 'push', messageHint: 'That felt light — add 5kg next set.' }`
- ✅ `evaluateSet({ rpe: 9, goal: 'Build Muscle' })` → `{ tone: 'ease', messageHint: 'Too heavy for growth reps — drop 5kg.' }`
- ✅ `checkMilestone({ currentWeight: 85, exerciseMaxWeight: 82.5 })` → `{ type: 'weight_pr' }`
- ✅ `checkMilestone({ streakData: { current: 7 } })` → `{ type: 'streak' }`
- ✅ All 5 server agent modules load: `node -e "require('./server/agents/router')"` (orchestrator, planning, memory, motivation, types)
- ✅ Agent response includes `motivationDirective` field when `functionCall` (log_set) is present
- ✅ Orchestrator system prompt no longer has the old directive #6 text ("If the Progression Status indicates a push recommendation...")
- ✅ `app/workout.js` no longer has inline RPE threshold logic (old lines 252-276 replaced)
- ✅ Celebration banner appears on weight PR detection with haptic feedback
- ✅ `expo export --platform ios` compiles without errors

---

### Milestone 6: Visual Generation Agent ✅ COMPLETE (2026-03-14)

**Goal:** Add image generation capabilities for exercise demonstrations and form checks.

**Status:** Implemented and verified. Visual Agent created with 3 image generation functions, `POST /api/agent/image` endpoint added, visual intent classification added to router, "Show Me" button wired in workout screen, shareable workout card added to completion modal. All 6 server agent modules load cleanly. 9/9 intent classification tests pass. `expo export --platform ios` compiles without errors.

**Architectural decision:** Visual intent classification lives in the **router** (same pattern as planning intent from Milestone 4), not the orchestrator. The router calls `classifyIntent()` (<1ms keyword matching) — visual intents go directly to the Visual Agent, bypassing the orchestrator entirely. If the Visual Agent fails, the router falls through to the orchestrator for a text-only response. The `POST /api/agent/image` endpoint exists as a **separate direct endpoint** for the "Show Me" button and "Share Workout" card, which bypass the chat/router flow entirely (no message needed, just exercise name or session stats).

**Backend tasks:**
1. ✅ Created `server/agents/visual.js` — 3 exported functions, all using `gemini-2.0-flash-exp` with `responseModalities: ['TEXT', 'IMAGE']`:
   - `generateExerciseDemo(exercise, equipment, modification)` — Generates instructional fitness illustration with muscle group labels, movement arrows, starting/ending positions. System prompt enforces fitness-only content.
   - `generateFormCheck(exercise, userDescription)` — Generates side-by-side correct vs incorrect form comparison with X/checkmark markers.
   - `generateWorkoutCard(sessionStats)` — Generates dark-themed shareable summary card with Aura branding, stats layout, Instagram-story aspect ratio.
   - Response parsing extracts `inlineData` (base64 image) and `text` (caption) from Gemini multimodal response parts.
   - In-memory LRU cache: `Map` keyed by `${exercise}|${equipment}|${modification}`, max 100 entries, oldest-first eviction. Cloud Run instances are ephemeral so in-memory is appropriate.
2. ✅ Created `POST /api/agent/image` endpoint in `server/routes/agent.js`:
   - Accepts `{ type, exercise, equipment, modification, userDescription, sessionStats }`
   - Routes to `generateExerciseDemo`, `generateFormCheck`, or `generateWorkoutCard` based on `type` field
   - 30s server-side timeout (returns 504 if exceeded)
   - Returns `{ image, caption }` or `{ error }` with 500
3. ✅ Updated `server/agents/router.js` — Visual intent classification and routing (NOT orchestrator — same pattern as planning):
   - Added `'visual'` return value to `classifyIntent()` with keywords: 'show me', 'what does', 'look like', 'demonstrate', 'form check', 'how to do', 'proper form', 'exercise demo', 'show form'
   - Visual routing block between planning path and orchestrator path: extracts exercise name by stripping visual keywords from message, falls back to `agentContext.workout.currentExercise`, calls `generateExerciseDemo()`, returns `buildAgentResponse()` with `image`, `imageCaption`, `agentsUsed: ['orchestrator', 'memory', 'visual']`
   - Try/catch with fallback to orchestrator (same pattern as planning agent fallback)
4. ✅ In-memory cache in `visual.js` (see #1) — keyed by `exercise|equipment|modification`, max 100 entries
5. ✅ Updated `server/index.js` — JSON body limit increased from default to `5mb` for base64 image payloads (~300-500KB per 512x512 PNG)
6. ✅ Updated `server/agents/types.js`:
   - Added `image` (default `null`) and `imageCaption` (default `null`) to `buildAgentResponse()` return object
   - Added `visualLatencyMs` (optional) to `logInteraction()` entry

**Frontend tasks:**
7. ✅ Added `generateExerciseImage(exercise, equipment, modification)` and `generateWorkoutCard(sessionStats)` to `lib/api.js` — both POST to `/api/agent/image` with 30s AbortController timeout (following `generatePlan` pattern)
8. ✅ Created `components/ImageMessage.js` — Chat image widget following `SwapExerciseWidget.js` pattern:
   - Container: `bgCard` bg, `borderSubtle` border, `radius.md` rounding
   - Header bar: image icon + "Exercise Demo" label with primary accent
   - Image: RN `<Image source={{ uri }}/>` with `resizeMode="contain"`, 280px height
   - Caption: Below image, `fontSize: 13`, `Inter_400Regular`, `textSecondary`
9. ✅ Updated `app/(tabs)/index.js` — Render images in chat:
   - Imported `ImageMessage` component
   - Added `image` and `imageCaption` to message state in `handleSend` response handling
   - Added conditional render after `swapSuggestion` block: `{msg.image && <ImageMessage ... />}`
10. ✅ Updated `app/workout.js` — "Show Me" button + image display:
    - Added `Image` and `Share` to react-native imports
    - Added `generateExerciseImage` and `generateWorkoutCard` to api imports
    - Added state: `exerciseImage`, `isImageLoading`, `shareImage`, `isShareLoading`
    - Rewired `formGuideButton` (was non-functional) as "Show Me" toggle: if image exists, clears it; otherwise calls `generateExerciseImage(currentExercise.name, equipment)` with loading state
    - Button icon changes between `visibility`/`visibility-off` based on image state; shows `ActivityIndicator` while loading
    - Exercise demo image displays below target section in a styled container matching app theme
    - `exerciseImage` cleared on exercise change in existing `useEffect`
11. ✅ Updated `app/workout.js` — Shareable workout card in completion modal:
    - "Share Workout" button added before FINISH button in completion modal
    - Calls `generateWorkoutCard(completeStats)` API on press
    - Displays generated card image in modal with `resizeMode="contain"`
    - "Share" action button uses RN `Share.share()` API (no new dependency needed)
    - Loading state with `ActivityIndicator` while generating

**Implementation discoveries:**
- Visual intent classification is in the router (not the orchestrator), consistent with the planning intent pattern from Milestone 4. This avoids a wasted Flash-Lite call for visual requests and keeps the visual fallback simple.
- The PRD originally said to update `server/agents/orchestrator.js` for visual routing (task #3), but following the Milestone 4 pattern, routing lives in `router.js` instead. The orchestrator remains a pure conversational agent.
- The PRD specified "Gemini 3.1 Flash Image" model, but the actual model identifier used is `gemini-2.0-flash-exp` with `responseModalities: ['TEXT', 'IMAGE']` — this is the current Gemini model that supports native image generation. The model name is stored as a constant for easy updates.
- Gemini's multimodal image response puts image data in `response.candidates[0].content.parts` as `inlineData` objects (with `mimeType` and base64 `data`), interspersed with `text` parts. The extraction loop handles any ordering of parts.
- The `POST /api/agent/image` endpoint is separate from the chat `POST /api/agent` endpoint intentionally — the "Show Me" button and "Share Workout" card don't go through the chat/router flow at all. They're direct API calls with specific parameters, no message or history needed.
- The existing `formGuideButton` styles (workout.js) were already positioned and styled correctly — only the `onPress` handler and icon/text needed changing. The button was a non-functional placeholder since the original UI build.
- Exercise name extraction from chat messages works by stripping visual keywords and punctuation from the message. If the remaining text is too short (<2 chars), it falls back to `agentContext.workout.currentExercise`. This handles both "show me how to do a deadlift" (extracts "a deadlift") and just "show me" (falls back to current exercise).
- The `AGENTS.visual` enum value was already defined in `types.js:7` from Milestone 1's initial enum setup — no addition needed.
- Cache eviction uses simple oldest-first deletion via `Map.keys().next().value` — `Map` preserves insertion order in JavaScript, making this an efficient LRU-like strategy without additional data structures.
- The Share functionality uses RN's built-in `Share.share({ message })` API which opens the native share sheet. For MVP, it shares the caption text. Sharing the actual image as a file would require `expo-sharing` or `react-native-share` — deferred to a future enhancement.

**Validation:**
- ✅ `node -e "require('./server/agents/visual')"` loads without error
- ✅ `node -e "require('./server/agents/router')"` loads all 6 agent modules (orchestrator, planning, memory, motivation, visual, types)
- ✅ `node -e "require('./server/routes/agent')"` loads without error
- ✅ Intent classification: 9/9 test cases pass (visual ×5: "show me how to do a deadlift", "what does a Romanian deadlift look like", "proper form for bench press", "how to do a squat", "form check on my overhead press"; plus swap, overload, plan_modify, chat all still correctly classified)
- ✅ `buildAgentResponse()` correctly includes `image` and `imageCaption` fields
- ✅ `logInteraction()` accepts and logs `visualLatencyMs`
- ✅ `POST /api/agent/image` endpoint routes to correct handler based on `type` field
- ✅ In-memory cache: `Map` with max 100 entries, keyed by exercise|equipment|modification
- ✅ `expo export --platform ios` compiles without errors
- ✅ All existing intent classifications unchanged (swap, plan_modify, overload, chat)

---

### Milestone 7: Integration Testing & Cleanup

**Goal:** Remove deprecated code paths, ensure all agents work together end-to-end, add error handling and fallbacks.

**Backend tasks:**
1. Remove `/api/coach` route (fully replaced by `/api/agent`)
2. Update `/api/programmer/submit` to use Planning Agent internally
3. Add error handling to agent router:
   - If Planning Agent fails → Orchestrator handles with simpler response
   - If Visual Agent fails → return text-only response with apology
   - If Memory Agent fails → Orchestrator uses frontend-provided context as fallback
4. Add request timeout per agent (Orchestrator: 5s, Planning: 15s, Visual: 30s, Memory: 2s)
5. Add agent health check endpoint: `GET /api/agent/health`

**Frontend tasks:**
6. Remove `sendCoachMessage` from `lib/api.js`
7. Remove fallback logic added in Milestone 1 (old endpoint no longer needed)
8. Add error states for agent failures (graceful degradation in UI)
9. Add retry logic for transient agent failures (1 retry with 2s backoff)
10. Update onboarding to create initial location and wire into new flow

**Validation:**
- Full workout flow: select location → start workout → log sets → get coaching → swap exercise → complete → celebration
- Agent failures degrade gracefully (text-only responses, no crashes)
- No references to old `/api/coach` endpoint remain
- Agent interaction logs capture full session data

---

## 7. Technical Considerations

### Latency Budget

| Agent | Target | Max |
|-------|--------|-----|
| Orchestrator (direct reply) | 300ms | 1s |
| Memory Agent | 50ms | 200ms |
| Orchestrator → Planning | 1.5s | 3s |
| Orchestrator → Motivation | 100ms | 500ms |
| Visual Agent | 3s | 10s |

### Error Handling Strategy

- **Graceful degradation:** If a specialist agent fails, the Orchestrator provides a simpler response using only its own capabilities
- **Timeout cascading:** Agent router enforces per-agent timeouts; if a sub-agent times out, the Orchestrator responds with what it has
- **Retry policy:** Only Memory Agent retries (1 retry, 1s backoff). LLM agents do not retry (too expensive)

### Cost Optimization

- Memory Agent is deterministic (no LLM cost)
- Motivation Engine is primarily deterministic (minimal LLM cost for phrasing only)
- Visual Agent is on-demand only (user must request)
- Image caching reduces Visual Agent calls
- Orchestrator handles ~70% of messages directly (simple chat) without routing

### Migration Strategy

- Milestones 1-2: Dual endpoint (old `/api/coach` + new `/api/agent`) — no breaking changes
- Milestones 3-6: New features use new endpoint exclusively
- Milestone 7: Remove old endpoint, cut over completely

---

## 8. Out of Scope (Future Work)

- Voice input/output for hands-free coaching
- Real-time video form analysis
- Social features (sharing, leaderboards)
- Apple Watch / wearable integration
- Offline agent mode (on-device models)
- Multi-language support
- User authentication (currently single-user local app)
