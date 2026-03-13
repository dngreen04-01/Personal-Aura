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

### Milestone 3: Location Manager UI

**Goal:** Build the location management screen and integrate location selection into the workout flow.

**Frontend tasks:**
1. Create `app/locations.js` — Location manager screen:
   - List saved locations with equipment summaries
   - Add new location: name input + equipment checklist (categorized: barbells, dumbbells, machines, cables, bodyweight, etc.)
   - Edit existing location
   - Delete location with confirmation
   - Set default location toggle
2. Add navigation to Location Manager from Profile tab (`app/(tabs)/profile.js`)
3. Add location selector to Chat screen (`app/(tabs)/index.js`):
   - Dropdown or bottom sheet before "Start Workout"
   - Shows saved locations + "Add New" option
   - Selected location passed to workout context
4. Update `app/workout.js` to display current location name in header
5. Update onboarding flow (`app/onboarding.js`) to create initial location from equipment selection:
   - After equipment step, prompt for location name (default: "My Gym")
   - Save as first location entry

**Backend tasks:**
6. Update `server/agents/memory.js` `buildAgentContext` to include resolved equipment list from location

**Validation:**
- User can create, edit, delete locations with equipment profiles
- Location selection flows into workout session
- Onboarding creates initial location
- Agent context includes equipment from selected location

---

### Milestone 4: Planning Agent

**Goal:** Extract complex reasoning (plan modification, exercise swaps, progressive overload calculations) into a dedicated Planning Agent that the Orchestrator delegates to.

**Backend tasks:**
1. Create `server/agents/planning.js`:
   - `handleSwapRequest(context, memoryData)` — Generate exercise alternatives given constraints (injury, equipment, preference)
   - `handlePlanModification(context, memoryData)` — Modify today's workout based on constraints
   - `handleProgressiveOverload(context, memoryData)` — Calculate next session targets
   - Uses Gemini 3.1 Pro for complex reasoning
2. Update `server/agents/orchestrator.js` with intent classification:
   - Add routing logic: if intent matches swap/plan change/overload → delegate to Planning Agent
   - Orchestrator composes Planning Agent's structured output into natural language response
3. Update `server/agents/router.js` to support multi-agent orchestration:
   - Orchestrator → Memory Agent (get context) → Planning Agent (reason) → Orchestrator (compose response)
   - Track per-agent latency in response
4. Move swap logic out of coach.js `suggest_swap` function declaration into Planning Agent

**Frontend tasks:**
5. Update chat UI to handle `agentsUsed` in response (optional dev indicator)
6. Handle new swap response format (Planning Agent returns richer alternatives with biomechanical reasoning)

**Validation:**
- "Swap overhead press" triggers Orchestrator → Memory → Planning → response
- Exercise swaps include reasoning (not just name + is_recommended)
- Plan modifications respect location equipment constraints
- Response latency tracked per agent

---

### Milestone 5: Motivation Engine

**Goal:** Extract RPE-based coaching logic into a deterministic Motivation Engine that shapes the Orchestrator's tone and suggestions.

**Backend tasks:**
1. Create `server/agents/motivation.js`:
   - `evaluateSet(rpe, goal, exerciseHistory)` — Returns coaching directive:
     ```json
     {
       "tone": "push",
       "weightAdjustment": "+2.5kg",
       "message_hint": "RPE 5 with 80kg — you've got more in the tank",
       "celebration": null
     }
     ```
   - `checkMilestone(sessionStats, history)` — Detect PRs, streaks, volume records
   - Hardcoded RPE decision matrix (not AI-generated)
   - Goal-specific threshold configuration
2. Update `server/agents/orchestrator.js`:
   - After set is logged, call Motivation Engine before composing response
   - Inject motivation directive into system prompt for natural language generation
3. Update `server/agents/router.js` to include Motivation Engine in set-logging flow:
   - User logs set → Orchestrator → Memory (get history) → Motivation (evaluate) → Orchestrator (compose)
4. Remove inline RPE logic from current coach system prompt (now handled by Motivation Engine)

**Frontend tasks:**
5. Update weight suggestion badge in `app/workout.js` to use Motivation Engine output instead of local `getExerciseProgressionData` calculation
6. Add celebration animations for PR detection (Motivation Engine returns `celebration` flag)
7. Display milestone notifications from Motivation Engine

**Validation:**
- RPE 5 on strength goal → "Add 5kg" suggestion
- RPE 9 on hypertrophy goal → "Drop 5kg" suggestion
- PR detected → celebration flag in response
- Weight badges match Motivation Engine output

---

### Milestone 6: Visual Generation Agent

**Goal:** Add image generation capabilities for exercise demonstrations and form checks.

**Backend tasks:**
1. Create `server/agents/visual.js`:
   - `generateExerciseDemo(exercise, equipment, modification)` — Generate exercise demonstration image
   - `generateFormCheck(exercise, userDescription)` — Generate form correction visual
   - `generateWorkoutCard(sessionStats)` — Generate shareable summary card
   - Uses Gemini 3.1 Flash Image model
   - Returns base64 image + caption
2. Create `POST /api/agent/image` endpoint in `server/routes/agent.js`
3. Update `server/agents/orchestrator.js`:
   - If user asks "show me how to do X" or "what does X look like" → route to Visual Agent
   - Include image in response payload
4. Add image caching layer (cache generated images by exercise+equipment key to avoid redundant generation)

**Frontend tasks:**
5. Add `generateExerciseImage()` to `lib/api.js`
6. Create `ImageMessage` component for rendering generated images in chat
7. Update chat screen to display images inline when response includes `image` field
8. Add "Show me" quick action button on exercise header in workout screen
9. Add shareable workout summary card generation on workout completion

**Validation:**
- "Show me how to do a Romanian deadlift" → image appears in chat
- "Show me" button on exercise → image loads
- Workout completion can generate shareable card
- Images are cached (second request for same exercise is instant)

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
