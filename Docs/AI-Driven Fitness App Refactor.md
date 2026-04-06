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

* **Phase 2: Timers & Interval Adapters (1-2 Weeks)**  
  * Implement IntervalTimer and TimerInput components.  
  * Update the Planning Agent to generate block-level plans.  
* **Phase 3: Async Generation via Flex API (1 Week)**  
  * Implement the asynchronous 202 Accepted polling pattern for the POST /api/programmer/submit route.

  * Serve users a provisional plan while the Flex API processes the full request.

* **Phase 4: Goal Elicitation & Modality Expansion (2 Weeks)**  
  * Launch the gemini-3.1-flash-lite-preview onboarding conversational UI.

  * Add remaining UI adapters (CircuitTracker, AMRAPTimer, DistanceInput) to support all targeted family members.