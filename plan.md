# Interactive Workout Chat — Implementation Plan

## Goal
Transform the chat tab from a static "here's your workout" card into a conversational, agent-driven experience where Aura greets the user, discusses their progress, presents today's workout conversationally, and lets them modify or replace it entirely through natural dialogue.

---

## Current Behavior
1. Chat loads → fetches plan → shows a static greeting + "Daily Target" card immediately
2. User can chat with the AI coach, but modifications are limited to exercise swaps
3. The AI points back to the same scheduled workout regardless of user requests
4. "Start Workout" is a button on the card → navigates to workout-summary → workout

## Target Behavior
1. Chat loads → AI sends a **personalized welcome** referencing recent progress, streak, last workout
2. AI conversationally describes today's scheduled workout and asks if user is ready, or has other plans/injuries/fatigue
3. User can:
   - **Accept** → AI shows an inline "Start Workout" button in the chat flow
   - **Request modifications** (shorter, longer, different focus, different equipment) → AI modifies the workout, shows the updated plan as a visual card in chat, then offers to start
   - **Request something completely different** → AI generates a brand-new session workout, shows it as a card, offers to start
   - **Report injury/fatigue** → AI adapts the workout accordingly
4. Workout-summary screen is preserved as the intermediate step before active workout

---

## Implementation Steps

### Step 1: New backend endpoint — `/api/agent/greet`
**File:** `server/routes/agent.js` (or new route file)

Create a dedicated greeting endpoint that:
- Receives: user profile, latest plan, session history summary, today's day-of-week
- Uses Gemini Flash-Lite with a **greeting-specific system prompt** that instructs it to:
  - Welcome the user by feel (time of day, streak data, last session recap)
  - Mention what's scheduled today (day focus, exercise count, duration estimate)
  - Ask if they're ready or want to adjust anything
  - Keep it to 2-3 sentences, warm and motivating
- Returns: `{ text: "..." }` — just the greeting message

**Why a separate endpoint?** The current orchestrator prompt is tuned for mid-workout coaching (terse, 1-2 sentences). The greeting needs a different tone and context.

### Step 2: New backend capability — `modify_workout` function tool
**File:** `server/agents/orchestrator.js` + `server/agents/planning.js`

Add a new function tool to the orchestrator alongside `log_set` and `suggest_swap`:

```
modify_workout({
  modification_type: "adjust" | "replace",
  instructions: string,  // e.g. "make it 30 minutes, more core work"
  current_exercises: array  // the current day's exercises
})
```

- **"adjust"**: Planning agent modifies the existing workout (add/remove exercises, change sets/reps, shift focus). Returns modified exercises array.
- **"replace"**: Planning agent generates a completely new session workout from scratch based on user's request, equipment, and goals. Returns new exercises array.

The orchestrator's system prompt gets updated to recognize modification intents and call this tool instead of just `suggest_swap`.

**Decision logic for plan persistence** (per user's choice — "Both options"):
- "adjust" modifications → update the stored plan in DB (these are minor tweaks the user will likely want going forward)
- "replace" modifications → session-only override (don't touch the 7-day plan)

### Step 3: New chat message type — `workout_card`
**File:** `app/(tabs)/index.js`

Add a new rendered message type for inline workout cards in the conversation flow. When the AI confirms a workout (original or modified), it returns a structured response that the frontend renders as:

```
┌─────────────────────────────┐
│ 💪 Upper Body - Strength    │
│ ⏱ 45-55 min · 6 exercises  │
│                             │
│ • Bench Press 3×8-10        │
│ • Bent Over Row 3×10        │
│ • ...                       │
│                             │
│    [ Start Workout ▶ ]      │
└─────────────────────────────┘
```

This replaces the static "Daily Target" hero card. The card appears **inline in the chat** as an AI message, with the "Start Workout" button embedded. Tapping it navigates to workout-summary as before.

### Step 4: Refactor chat screen greeting flow
**File:** `app/(tabs)/index.js`

Change `loadPlanAndGreet()`:

**Before:**
1. Fetch plan → set todayWorkout → show static greeting messages → render Daily Target card

**After:**
1. Fetch plan, user profile, session stats (last workout date, streak, recent progress)
2. Call `/api/agent/greet` with this context
3. Display the AI's greeting as the first chat message (Aura avatar + conversational text)
4. **Do NOT** show the Daily Target card immediately — wait for user engagement
5. If user says "let's go" / "ready" / accepts → AI responds with the workout_card message type (inline card with Start button)
6. If user wants changes → conversation continues → AI calls `modify_workout` → shows updated workout_card

### Step 5: Update orchestrator system prompt for pre-workout context
**File:** `server/agents/orchestrator.js`

Update the system prompt to handle two distinct modes:

**Pre-workout mode** (no active session):
- Conversational, warm, slightly longer responses
- Recognizes intents: ready to start, want modifications, want different workout, have injury, feeling tired
- Uses `modify_workout` for changes
- Returns structured `workout_card` data when presenting a workout

**Mid-workout mode** (active session — current behavior):
- Terse, motivational, 1-2 sentences
- Uses `log_set` and `suggest_swap` as today
- No change to existing mid-workout flow

The mode is determined by whether `userContext.sessionId` exists.

### Step 6: Update router intent classification
**File:** `server/agents/router.js`

Add/update intent categories:
- `'ready'`: "let's go", "ready", "start", "begin", "I'm good" → return workout_card + navigate
- `'modify'`: "make it shorter", "less volume", "more cardio", "add abs", "change to legs" → trigger modify_workout
- `'replace'`: "I want to do yoga", "completely different", "skip the plan", "outdoor workout" → trigger modify_workout with type=replace
- `'injury'`/`'fatigue'`: "my shoulder hurts", "feeling tired", "didn't sleep well" → trigger modify_workout with type=adjust + injury/fatigue context

### Step 7: Frontend message handling for `modify_workout` responses
**File:** `app/(tabs)/index.js`

When the agent response includes a `workoutCard` (new field alongside existing `swapSuggestion`):
- Render the inline workout card in the chat messages
- Store the modified exercises in state (`todayWorkout`)
- The "Start Workout" button on the card navigates to workout-summary with the (possibly modified) exercises
- If `modification_type === "adjust"`, also update the plan in SQLite via `updatePlan()`
- If `modification_type === "replace"`, only hold in state (session-only)

### Step 8: Remove static Daily Target card
**File:** `app/(tabs)/index.js`

- Remove the hero-style `WorkoutCard` component that currently renders above the chat
- The workout info now lives inside chat messages (via `workout_card` message type)
- Keep the component code for reference but don't render it on load

---

## Files Changed

| File | Change |
|------|--------|
| `server/routes/agent.js` | Add `/greet` endpoint |
| `server/agents/orchestrator.js` | Add `modify_workout` tool, dual-mode system prompt |
| `server/agents/planning.js` | Add `handleWorkoutModification()` for adjust/replace |
| `server/agents/router.js` | New intent categories (ready, modify, replace, injury) |
| `server/agents/memory.js` | Add greeting context builder (streak, last session, progress summary) |
| `app/(tabs)/index.js` | Refactor greeting flow, add workout_card renderer, remove static card, handle modify responses |
| `lib/database.js` | Add `getRecentProgressSummary()` for greeting context |
| `lib/api.js` | Add `greetUser()` API call |

## What Stays the Same
- Workout-summary screen (unchanged)
- Active workout screen (unchanged)
- Mid-workout coaching behavior (unchanged)
- Set logging, rest timer, motivation engine (unchanged)
- 7-day plan structure and storage (unchanged)
- Onboarding flow (unchanged)

## Migration / Backwards Compatibility
- No database schema changes needed
- The greeting endpoint is additive
- Existing chat messages continue to work
- The `modify_workout` tool is a new addition, not replacing anything

## Rough Implementation Order
1. Step 1 (greet endpoint) + Step 5 (dual-mode prompt) — backend foundation
2. Step 2 (modify_workout tool) + Step 6 (router updates) — backend capabilities
3. Step 3 (workout_card component) + Step 4 (greeting flow refactor) + Step 7 (modify handling) + Step 8 (remove static card) — frontend
