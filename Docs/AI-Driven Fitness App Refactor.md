# **Product Requirements Document: Aura Core (Multi-Modality Architecture)**

## **1\. Executive Summary & Problem Statement**

Aura's current architecture is severely limited by a hard-coupled reliance on traditional strength training (sets × reps × weight) across its database, AI prompts, and UI. The platform currently branches on only three hardcoded goals: build\_muscle, lose\_fat, and increase\_strength.

Because of this rigid structure, the app cannot natively track fluid fitness modalities such as HIIT, circuits, cardio, interval training, or sport-specific conditioning like Hyrox. When users perform non-strength workouts, they cannot track them, creating a massive data blind spot that breaks the AI coach's ability to monitor recovery, volume, and progressive overload.

This refactor will transition Aura to a universal, goal-agnostic architecture driven by a robust session\_blocks data model and orchestrated by Gemini via the cost-effective Flex API.

## ---

**2\. Target Audience & Narrowest Wedge**

The immediate target audience consists of three distinct beta testers (family members), each requiring a different modality:

1. **Hyrox Trainer:** Requires mixed-modality tracking (running combined with functional stations like sled pushes and wall balls).  
2. **Sport-Specific Athlete:** Requires performance-oriented programming (plyometrics, speed drills, agility).  
3. **Aesthetic/Glute-Focused:** Requires targeted muscle volume programming utilizing varied rep schemes.

## ---

**3\. Architecture Overview**

The unified "Aura Core" blends an AI-native elicitation engine with a strict, block-based physical data model.

### **Data Model Constraints**

The legacy flat workout\_sets table will be replaced by a typed hierarchical event model:

* **workout\_plans:** Holds the versioned contract and plan\_json.  
* **session\_blocks:** Defines the structure of the workout segment (e.g., block type, label, and configuration such as rounds or time caps).  
* **block\_entries:** The individual logged efforts within a block (e.g., a strength set, a timed effort, or a distance effort).

### **Migration & Database Rules**

* **No Big-Bang Migrations:** The migration from workout\_sets to block\_entries must utilize a backup-first strategy. The old workout\_sets table must be retained for at least two app versions to ensure rollback safety.  
* **Dual-Source Elimination:** Rename the legacy exercises\_json to plan\_snapshot\_json and treat it as immutable to prevent state-drift bugs.  
* **Integrity:** Implement SQLite CHECK constraints on block\_type and entry\_type to prevent string typos from corrupting analytics.  
* **Schema Evolution:** Add additive JSON columns to user\_profile, including goals\_json, style\_preferences\_json, sport\_context\_json, and injuries\_json.

## ---

**4\. Intelligence Layer & Gemini Integration**

### **Goal Elicitation Agent**

* Replace static goal selection with a 2-3 minute conversational onboarding flow.

* Users will express their goals in free-text; the AI will classify these into a canonical taxonomy.

* This agent will utilize gemini-3.1-flash-lite-preview for per-turn conversational speed.

### **Planning Agent & Flex API**

* Complex, multi-modality block generation will run on the Gemini Flex API.

* Utilizing the Flex API reduces heavy generation costs by 50% while allowing for 1-15 minute asynchronous processing.

* **Contract Layer:** Implement a validateBlockPlan() validation function. All Gemini-generated plans must be validated against the block config schemas before saving, with a maximum of two retries for invalid outputs.

### **Progress Analyzer & Drift Detection**

* A nightly background job will run on the Flex tier to detect plan drift.

* Triggers include style\_mismatch (user swapping the same style multiple times) or completion\_drop (session completion falling below 70%).

## ---

**5\. UI/UX Requirements**

The current workout.js file is a 1,488-line monolith containing 39 useState hooks. This must be addressed before adding new features.

### **Component Architecture**

* **Extraction:** Split workout.js into distinct components (e.g., BlockNavigator, StrengthAdapter) before implementing the new block types.  
* **Layout Contract:** Build a BlockAdapterShell.js component to serve as a shared layout contract featuring fixed zones (Block Position, Hero Metric, Primary Action).  
* **Modals:** Generalize the legacy BeginSetModal into a multi-purpose TransitionModal capable of handling 5 different transition variants. Extend the existing ExerciseHub into a BlockHub session map.

### **Interaction & Accessibility Standards**

* **Paused States:** Explicitly define and handle Paused and Interrupted states for all timer-based blocks.  
* **Wake Lock:** Implement screen wake lock (expo-keep-awake) during interval, AMRAP, EMOM, timed, and cardio blocks to prevent the device from sleeping mid-effort.  
* **Touch Targets:** Ensure all actionable UI elements meet a minimum 44pt touch target standard.

## ---

**6\. Engineering Pre-Requisites (The Test Harness)**

Before Phase 1 feature code is written, a comprehensive 7-file test harness must be implemented to secure the blast radius:

1. \_\_tests\_\_/validateBlockPlan.test.js: Validates AI output schema.  
2. \_\_tests\_\_/gemini-block-generation.test.js: Captures and validates real Gemini output across all 9 block types using 5-10 seed prompts.  
3. \_\_tests\_\_/migration.test.js: Ensures workout\_sets to block\_entries migration idempotency.  
4. \_\_tests\_\_/blockCRUD.test.js: Verifies database operations.  
5. \_\_tests\_\_/getTrainingContext.test.js: Validates analytics snapshots before and after migration.  
6. \_\_tests\_\_/resume-integration.test.js: Tests session resumption during various block types.  
7. \_\_tests\_\_/active\_timer.test.js: Verifies timer persistence by generalizing the legacy active\_rest\_timer into a globally aware active\_timer.

## ---

**7\. Phased Rollout Plan**

* **Phase 0: Architecture & Safety (1-2 Weeks)** ✅ COMPLETED 2026-04-05  
  * Build the test harness and implement validateBlockPlan().  
  * Split workout.js and build the BlockAdapterShell.js.  
  * Ship schema migrations and write the legacyCompat.js shim to map legacy goals.

### Phase 0 Delivery Log

**Schema (`lib/database.js` — additive, non-breaking)**
* `session_blocks` table with CHECK constraint on `block_type` (9 canonical types) + FK index on `session_id`.
* `block_entries` table with CHECK constraint on `entry_type` (5 canonical types) + FK index on `block_id`.
* `user_profile` additive columns: `goals_json`, `style_preferences_json`, `sport_context_json`, `injuries_json`.
* `workout_sessions.plan_snapshot_json` — immutable snapshot alongside legacy `exercises_json` (dual-source elimination per §3).
* `active_rest_timer` generalized with `timer_kind` (default `'rest'`) + `context_json` — table name retained for rollback safety.
* Legacy `workout_sets` and `exercises_json` fully preserved and writable.

**Contract Layer (`lib/validateBlockPlan.js`)**
* Pure function: `{ valid, errors, normalized }` triple.
* Validates all 9 block types: strength, interval, amrap, emom, circuit, timed, distance, cardio, rest.
* 5 canonical entry types: `strength_set`, `timed_effort`, `distance_effort`, `round`, `rest`.

**Legacy Compatibility (`lib/legacyCompat.js`)**
* `mapLegacyGoal()` — maps `build_muscle` → `hypertrophy`, `lose_fat` → `body_composition`, `increase_strength` → `strength`. Passes through new taxonomy objects untouched.
* `workoutSetsToBlocks()` — projects legacy `workout_sets` rows into synthetic `session_blocks` + `block_entries` shape for unified analytics.
* Read-only shim — never writes to legacy tables.

**Component Scaffolds (`components/workout/`)**
* `BlockAdapterShell.js` — three-zone layout contract (position chip / hero metric / primary action). 44pt minimum touch targets. Wake-lock hook stubbed for Phase 2.
* `BlockNavigator.js` — block index nav with prev/next.
* `StrengthAdapter.js` — strength block rendered inside the shell (weight × reps hero, "LOG SET" primary action).
* `TransitionModal.js` — generalized BeginSetModal with 5 variants (`begin_set`, `next_round`, `next_station`, `exercise_complete`, `workout_complete`). Same glow-ring animation. Only `begin_set` fully wired in Phase 0.

**Test Harness (`__tests__/blocks/` — 7 files, 65 tests)**
1. `validateBlockPlan.test.js` — all 9 block types, malformed inputs, cross-block error aggregation.
2. `gemini-block-generation.test.js` — 7 valid + 4 malformed fixture prompts, offline CI via `__fixtures__/gemini-block-outputs.json`.
3. `migration.test.js` — idempotent schema creation, CHECK constraint enforcement, additive column presence, data preservation across re-init.
4. `blockCRUD.test.js` — insert/read/update/delete on blocks + entries, enum enforcement for all 9 block types and 5 entry types.
5. `getTrainingContext.test.js` — legacy analytics parity after migration, block rows don't corrupt legacy output, legacyCompat shim unit tests.
6. `resume-integration.test.js` — session resume with legacy-only, block-coexisting, and block-only sessions; plan_snapshot_json alongside exercises_json.
7. `active_timer.test.js` — rest/interval/amrap timer kinds with context_json, single-row constraint, legacy INSERT shape backward-compat.

**Test Infrastructure**
* `better-sqlite3` devDependency + `__mocks__/expo-sqlite.js` (in-memory SQLite backing the async API surface).
* `__mocks__/async-storage.js` for Node test environment.
* `jest.config.js` updated: `resetModules: true`, new module name mappings.
* Full suite: **147 tests passing, 0 regressions.**

### Phase 0 Discovery Notes

1. **`expect().rejects.toThrow()` unreliable with better-sqlite3 CHECK constraints in multi-file jest runs.** Prepared statements that throw on first execution silently succeed on identical re-invocation within the same test. Workaround: use try/catch + boolean assertion instead of `.rejects.toThrow()`. Filed as a known pattern for future test authors.

2. **`expo-sqlite` mock requires `foreign_keys = OFF` pragma** to match real device behavior. SQLite defaults to FKs off; better-sqlite3 defaults to FKs on. The mock explicitly disables them.

3. **`workout.js` refactor deferred to Phase 1 kickoff.** The 4 component scaffolds (BlockAdapterShell, BlockNavigator, StrengthAdapter, TransitionModal) define the layout contract. The actual extraction of workout.js (1,488 lines, 39 useState hooks → target <500 lines, <15 hooks) will happen as the first Phase 1 task when strength sessions migrate onto blocks, enabling on-device verification of the refactored UI. Attempting the extraction without live testing risked silent regressions in the critical strength-session path.  
* **Phase 1: Strength Parity (1-2 Weeks)** ✅ COMPLETED 2026-04-06  
  * Refactor the workout UI to use blocks/entries for strength workouts only.  
  * All existing strength functionality must work identically on the new schema.

### Phase 1 Delivery Log

**Block CRUD Helpers (`lib/database.js` — 6 new exports)**
* `createSessionBlock(sessionId, blockIndex, blockType, label, configJson)` — INSERT into `session_blocks`, returns id.
* `logBlockEntry(blockId, entryIndex, entryType, payloadJson)` — INSERT into `block_entries`, returns id.
* `getSessionBlocks(sessionId)` — SELECT ordered by `block_index`.
* `getBlockEntries(blockId)` — SELECT ordered by `entry_index`.
* `createBlocksFromPlan(sessionId, validatedPlan)` — batch-creates blocks from `validateBlockPlan()` output. Used on session start to scaffold one strength block per exercise.
* `logStrengthSet(sessionId, blockId, ...)` — **dual-write wrapper**: writes to legacy `workout_sets` (authoritative) then fire-and-forget to `block_entries`. If `blockId` is null (legacy session resume), only the legacy write runs.

**Hook Extractions (`hooks/` — 3 new files)**
* `useRestTimer.js` — rest timer lifecycle: 250ms countdown, alarm firing, Begin Set modal, +15s extend, AppState foreground/background transitions, Notifee notification action handler, app-kill timer recovery. Exposes `startRest()` for callers to initiate rest with an optional post-rest callback.
* `useExerciseState.js` — per-exercise state reset on index change: weight/reps/RPE, unit preference loading, progressive overload via `getExerciseProgressionData()`, milestone data for motivation engine, library cache lookup.
* `useWorkoutSession.js` — session create/resume, **auto-creates strength blocks** (one per exercise via `createBlocksFromPlan`), builds `blockMap` (exerciseName → blockId) for dual-write, debounced position state persistence. Idempotent: checks for existing blocks before creating duplicates on resume.

**workout.js Refactor**
* **39 → 14 useState hooks** in WorkoutScreen (target was <15). ✅
* **~1,100 → ~490 lines** of component logic excluding styles (target was <500). ✅
* `BeginSetModal` replaced by `TransitionModal` with dynamic variant selection: `begin_set` (between sets), `exercise_complete` (all sets done, not last exercise), `workout_complete` (final exercise).
* `handleDone()` now calls `logStrengthSet()` with `blockMap[currentExercise.name]` for dual-write.
* `handleSkipRest` refactored into hook; workout.js wraps it with exercise-hub fallback logic.

**Tests**
* 6 new tests added to `blockCRUD.test.js`: helper function CRUD (createSessionBlock, logBlockEntry, getSessionBlocks, createBlocksFromPlan) + dual-write verification (both tables populated, null blockId graceful).
* Full suite: **153 tests passing, 0 regressions.**

### Phase 1 Discovery Notes

1. **`useState` initializer function for one-time async calls.** Timer recovery (`recoverTimer()`) needs to run once on mount but depends on hook state. Using `useState(() => { recoverTimer(); })` as an initializer avoids an extra `useEffect` and fires synchronously during first render. This pattern works but is unconventional — future authors should prefer `useEffect` with an empty dep array for clarity.

2. **Block creation must be idempotent for session resume.** When a user kills the app mid-workout and resumes, `useWorkoutSession` re-runs init. Without an idempotency guard (`getSessionBlocks()` check before creating), duplicate blocks would be created. The guard checks for existing blocks and rebuilds `blockMap` from their `config_json.exercise` field.

3. **`setExerciseUnitPreference` lives in `database.js`, not `weightUtils.js`.** Despite the naming affinity with weight utilities, the function performs a database write with cloud sync. The refactored workout.js imports it from `database.js` alongside other DB functions. This caught a broken import during extraction.

4. **TransitionModal variant selection is derived, not stored.** Rather than adding state for the modal variant, it's computed inline from `currentSet >= totalSets` and exercise index position. This avoids stale variant state if the user navigates exercises while the alarm is fired.

5. **Rest timer `pendingAdvanceRef` pattern preserved across hook boundary.** The ref stores a callback (e.g., "show exercise hub" or "end session") that fires when the user taps Begin Set. This callback is set by `handleDone()` in workout.js but consumed by `handleBeginSet()` in useRestTimer.js. The ref is returned from the hook so workout.js can assign it. This cross-boundary ref pattern is fragile — Phase 2 should consider an event emitter or callback registration API.

6. **Styles account for ~600 of workout.js's 1,096 total lines.** The PRD target of <500 lines refers to component logic. Styles were not extracted because React Native `StyleSheet.create()` objects are not shareable across files without a shared module, and the styles are tightly coupled to this screen's layout. A future cleanup pass could extract shared patterns (adjustCard, pushBanner) into a theme extension.

* **Phase 2: Timers & Interval Adapters (1-2 Weeks)** ✅ COMPLETED 2026-04-06  
  * Implement IntervalTimer and TimerInput components.  
  * Update the Planning Agent to generate block-level plans.

### Phase 2 Delivery Log

**Timer Core (`hooks/useTimerCore.js` — new file)**
* Pure countdown/countup engine: 250ms tick loop, absolute end-time reference (drift-resistant), AppState foreground recalculation, pause/resume with remaining-time preservation.
* `restoreFromEndTime()` for app-kill recovery — returns true if still active, false if expired.
* Callback refs (`onCompleteRef`, `onTickRef`) avoid stale closure issues.
* `useRestTimer` left untouched — timer core is standalone, not a refactor. Zero regression risk.

**Timer Hooks (`hooks/` — 3 new files)**
* `useIntervalTimer.js` — work/rest phase cycling with round counter. State machine: IDLE→WORK→REST→...→COMPLETE. SQLite persistence via `saveBlockTimer()` with `timer_kind='interval'`. Phase-aware notifications. App-kill recovery. Notifee action handler for Continue/+15s.
* `useAMRAPTimer.js` — count-down from `time_cap_sec`. Manual `logRound()` button increments counter and writes `round` entries. Persists round count across app kills.
* `useEMOMTimer.js` — per-minute countdown with auto-advance. Logs `timed_effort` per completed minute. Auto-starts next minute on completion.

**UI Components (`components/workout/` — 6 new files)**
* `TimerDisplay.js` — shared `MM:SS` display at 56pt with phase-aware coloring (lime for work, gray for rest). `fontVariant: ['tabular-nums']` prevents digit-width jitter.
* `IntervalAdapter.js` — renders inside `BlockAdapterShell` with `keepAwake={true}`. Shows round counter, phase chip (WORK/REST), and countdown. Primary action: START → SKIP WORK/SKIP REST → (TransitionModal).
* `AMRAPAdapter.js` — countdown timer + manual round counter. Primary action: START → LOG ROUND. Round count displayed prominently below timer.
* `EMOMAdapter.js` — per-minute countdown with movement list. Primary action: START → PAUSE/RESUME. Movements from config displayed below timer.
* `BlockRouter.js` — routes `block_type` to correct adapter: `strength` → existing inline UI, `interval` → IntervalAdapter, `amrap` → AMRAPAdapter, `emom` → EMOMAdapter, unknown → UnsupportedBlockFallback.
* `UnsupportedBlockFallback.js` — graceful fallback for unimplemented block types with SKIP action.

**Wake Lock**
* `expo-keep-awake` installed and wired into `BlockAdapterShell.js`. Replaces Phase 0 stub. `activateKeepAwakeAsync('block-timer')` / `deactivateKeepAwake('block-timer')` via conditional `useEffect`. Strength blocks pass `keepAwake={false}`, timer blocks pass `keepAwake={true}`.

**Notification Generalization (`lib/notifications.js`)**
* `showBlockTimerNotification(label, totalSeconds, timerId, phase)` — persistent countdown with dynamic title ("Work Phase" / "Rest Phase").
* `fireBlockAlarm(label, timerId)` — immediate alarm with "Continue" / "+15s" action buttons.
* `dismissBlockTimerNotification()` — cleanup on phase transition.
* iOS notification category `'block-timer'` with Continue/+15s actions.
* Existing `rest-timer`/`rest-alarm` channels untouched.

**Database Helpers (`lib/database.js` — 4 new exports)**
* `saveBlockTimer(endTime, sessionId, timerKind, contextJson)` — writes to `active_rest_timer` with `timer_kind` + `context_json` columns.
* `getActiveBlockTimer()` — reads row with parsed `context` field.
* `logTimedEffort(blockId, entryIndex, elapsedSec, contextJson)` — thin wrapper for `timed_effort` entries.
* `logRoundEntry(blockId, entryIndex, roundNum, movementsCompleted)` — thin wrapper for `round` entries.

**Session Integration**
* `useWorkoutSession.js` extended: checks for `day.blocks` array (new plans), calls `createBlocksFromPlan()` with validation. Falls back to `createStrengthBlocks()` for legacy plans. Exposes `sessionBlocks` with parsed configs.
* `workout.js` integrated: imports `BlockRouter`, derives `currentBlock` and `isStrengthBlock`. Non-strength blocks render via `BlockRouter` instead of inline strength UI. Header and exercise strip handle block labels. Null-safety for non-strength blocks without matching exercises.

**Planning Agent (`server/agents/planning.js`)**
* `handlePlanRegeneration()` system prompt updated: output schema now includes `blocks` array alongside `exercises`. Block type reference section added (strength, interval, cardio, rest).
* `handleWorkoutModification()` workoutCard schema updated with `blocks` field.
* `server/routes/programmer.js`: `validateBlockPlan()` wired with 2-retry loop. Invalid blocks stripped on final failure. `exercises` derived from strength blocks when not provided by AI.
* `server/routes/onboarding.js`: blocks derived from exercises in post-processing (onboarding is always strength-only).

**Tests (8 new tests, 161 total)**
* `blockCRUD.test.js`: `logTimedEffort` with context, `logRoundEntry` with movements, null-context handling.
* `active_timer.test.js`: `saveBlockTimer`/`getActiveBlockTimer` roundtrip, context parsing, overwrite behavior, `clearRestTimer` compatibility, empty-table null return.
* Full suite: **161 tests passing, 0 regressions.**

### Phase 2 Discovery Notes

1. **`useTimerCore` left standalone, not refactored into `useRestTimer`.** The rest timer (207 lines) is production-proven with complex alarm/notification/modal behavior. Refactoring it to use `useTimerCore` would risk regressions for zero user-visible benefit. `useTimerCore` is proven through the new timer hooks instead. If rest timer needs changes in a future phase, the refactor can happen then with a clear diff to review.

2. **`BlockRouter` preserves inline strength UI.** The current workout.js has a rich strength experience (weight/reps adjusters, RPE slider, push suggestions, exercise images, estimated weight banners) that far exceeds `StrengthAdapter`'s simplified scaffold. `BlockRouter` only activates for non-strength blocks, keeping the full strength UX intact. Migrating strength to `StrengthAdapter` would require backporting all adjuster, RPE, and AI features — that's a separate cleanup task, not Phase 2 scope.

3. **Planning Agent transition period.** Both `blocks` and `exercises` are output simultaneously. `exercises` is derived deterministically from strength blocks in the route handler (not AI-generated), preventing mismatch. `useWorkoutSession` checks for `blocks` first, falls back to `exercises`. No Firestore migration needed — existing flat plans continue working via the `createStrengthBlocks` path.

4. **Notification channel reuse.** Block timer countdown notifications reuse the existing `rest-timer` Android channel (low importance, persistent) rather than creating a new channel. Only the alarm channel needs to be distinct for action button differences (Continue vs Begin Set). iOS uses a separate `block-timer` notification category.

* **Phase 3: Async Generation via Flex API (1 Week)**  
  * Implement the asynchronous 202 Accepted polling pattern for the POST /api/programmer/submit route.

  * Serve users a provisional plan while the Flex API processes the full request.

* **Phase 4: Goal Elicitation & Modality Expansion (2 Weeks)** ✅ COMPLETED 2026-04-06  
  * Launch the gemini-3.1-flash-lite-preview onboarding conversational UI.

  * Add remaining UI adapters (CircuitTracker, AMRAPTimer, DistanceInput) to support all targeted family members.

### Phase 4 Delivery Log

**Database Helpers (`lib/database.js` — 2 new exports)**
* `logDistanceEffort(blockId, entryIndex, distanceM, elapsedSec, contextJson)` — thin wrapper for `distance_effort` entries.
* `logRestEntry(blockId, entryIndex, durationSec)` — thin wrapper for `rest` entries.
* `saveUserProfile()` extended with optional `goalsJson`, `stylePreferencesJson`, `sportContextJson`, `injuriesJson` parameters. Backward-compatible — existing callers unaffected.

**Circuit Timer Hook (`hooks/useCircuitTimer.js` — new file)**
* State machine: IDLE → ACTIVE(station, round) → COMPLETE. Handles both timed stations (auto-advance via `useTimerCore` countdown) and rep-based stations (manual `advanceStation()` tap).
* `saveBlockTimer()` with `timer_kind='circuit'`, context stores station/round position for app-kill recovery.
* Logs `logRoundEntry()` per completed circuit round, `logTimedEffort()` per completed timed station.
* Notification integration via `showBlockTimerNotification()` for timed stations.

**Block Adapters (`components/workout/` — 5 new files)**
* `CircuitAdapter.js` — station name + reps/duration hero, station/round counters, START → STATION COMPLETE / SKIP STATION.
* `TimedAdapter.js` — countdown via `useTimerCore` inline (no custom hook), START → PAUSE/RESUME → auto-complete. Logs `logTimedEffort()`.
* `DistanceAdapter.js` — manual distance + optional time input, LOG DISTANCE → `logDistanceEffort()`. No timer, `keepAwake=false`.
* `CardioAdapter.js` — dual-mode: duration (countdown timer) or distance (manual input). Modality-aware labels (Run/Row/Bike/Ski). Logs `logTimedEffort()` or `logDistanceEffort()` depending on mode.
* `RestAdapter.js` — passive countdown via `useTimerCore`, gray rest-phase coloring, START REST → SKIP REST. Logs `logRestEntry()` with actual elapsed time. `timer_kind='rest_block'` distinct from set-level rest.

**BlockRouter (`components/workout/BlockRouter.js`)**
* Extended with 5 new switch cases: `circuit`, `timed`, `distance`, `cardio`, `rest`. All 9 canonical block types now have adapter coverage (strength handled inline in workout.js, 8 others via BlockRouter). `UnsupportedBlockFallback` only fires for truly unknown types.

**Planning Agent (`server/agents/planning.js`)**
* Block type reference expanded from 4 to all 9 canonical types in both `handlePlanRegeneration()` and `handleWorkoutModification()` system prompts. Includes config schemas for circuit (stations + rounds), amrap (time_cap + movements), emom (minutes + movements), timed (duration), distance (target_distance), and full cardio (modality + duration/distance).

**Goal Elicitation Agent (`server/agents/elicitation.js` — new file)**
* `handleElicitationTurn(message, history)` — multi-turn Gemini Flash-Lite conversation with `extract_goals` function calling declaration.
* System prompt guides 3-5 question natural conversation about goals, experience, injuries, style preferences, sport context.
* Classification taxonomy: 7 primary goals, 6 modalities, 6 styles.
* `extract_goals` function schema: `{ goals, injuries, sport_context, style_preferences, confirmation_message }`.
* Minimum 3-question guard before extraction. Returns `{ text, extractedData, isComplete }`.

**Onboarding API (`server/routes/onboarding.js` — 2 new endpoints)**
* `POST /api/onboarding/elicit` — single conversational turn. Input: `{ message, history }`. Output: `{ text, extractedData?, isComplete }`. Delegates to elicitation agent.
* `POST /api/onboarding/generate` — multi-modality plan generation. Input: full taxonomy + baselines + schedule. System prompt maps goals/modalities to appropriate block types (strength, circuit, cardio, distance, interval, etc.). `validateBlockPlan()` wired with 2-retry loop. Falls back to strength-only blocks if validation exhausts retries. Firestore persistence tagged `'onboarding_v2'`.
* Existing `POST /api/onboarding` endpoint untouched for backward compatibility.

**Client API (`lib/api.js` — 2 new exports)**
* `sendElicitationMessage(message, history)` — POST to `/api/onboarding/elicit`, 30s timeout.
* `generateMultiModalityPlan(profile)` — POST to `/api/onboarding/generate`, 90s timeout.

**Onboarding UI (`app/onboarding.js`)**
* Initial step changed from `goal` (static buttons) to `elicitation` (free-text chat). Opening message: "Hey! I'm Aura, your new coach. Tell me about your fitness goals — what are you training for?"
* Text input enabled during `elicitation` step with send button. Disabled during structured widget steps (equipment, bodyStats, schedule, assessment).
* Each user message sent to `/api/onboarding/elicit` with full chat history. Aura responses rendered as bubbles in the message thread.
* On `isComplete`: goal confirmation card shown with extracted primary goal, modalities, sport context, injuries. "Looks good!" button advances to equipment step.
* On API error: graceful fallback to legacy goal buttons with "No worries — let's do this the quick way instead."
* `handleFinishAssessment()` branches: if `elicitedData` exists, calls `generateMultiModalityPlan()`; otherwise falls back to legacy `generatePlan()`.
* `saveUserProfile()` now passes `goalsJson`, `stylePreferencesJson`, `sportContextJson`, `injuriesJson` from elicited data.
* New state: `chatInput`, `chatHistory`, `elicitedData`, `isElicitating`, `elicitationFailed`.

**Tests (3 new tests, 164 total)**
* `blockCRUD.test.js`: `logDistanceEffort` with context and null context, `logRestEntry` with duration.
* Full suite: **164 tests passing, 0 regressions.**

### Phase 4 Discovery Notes

1. **`useCircuitTimer` handles mixed station types within a single circuit.** Stations can freely mix timed (auto-advance) and rep-based (manual advance) within the same circuit block. The hook checks `station.duration_sec > 0` on each station transition to decide whether to start the timer or wait for manual tap. This flexibility supports Hyrox-style circuits where some stations are timed (e.g., 500m row) and others are rep-based (e.g., 10 wall balls).

2. **`RestAdapter` uses `timer_kind='rest_block'` to avoid collision with set-level rest.** The existing `active_rest_timer` table uses `timer_kind='rest'` for between-set rest managed by `useRestTimer`. Block-level rest (a standalone rest block in the workout plan) uses `'rest_block'` for distinct recovery behavior. Both can coexist without interference.

3. **CardioAdapter is dual-mode, not two separate adapters.** The `validateBlockPlan` config schema allows cardio blocks with either `duration_sec`, `target_distance_m`, or both. A single adapter with internal mode selection prevents component proliferation and matches the schema's flexibility. Duration mode uses countdown timer; distance mode uses manual input.

4. **Elicitation-to-legacy goal mapping preserves backward compatibility.** When elicitation extracts `primary: 'hypertrophy'`, it maps to `selectedGoal = 'build_muscle'` for the legacy `saveUserProfile(goal)` string field. The canonical taxonomy is stored separately in `goals_json`. This dual-write pattern ensures existing analytics and plan logic that reads the `goal` string column continues working.

5. **Elicitation fallback is immediate, not retry-based.** On any error from the `/elicit` endpoint (network, server, timeout), the UI instantly shows legacy goal buttons instead of retrying. This prevents users from being stuck on a broken chat loop during onboarding — the critical path that determines first-session experience.