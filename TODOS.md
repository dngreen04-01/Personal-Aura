# TODOS

## Deferred Work

### Full Workout Dashboard Live Activity (Approach C)
**What:** Upgrade Live Activity from timer-only to full workout dashboard: exercise name, set 3/4, rest countdown, with interactive "Begin Set" and "+15s" buttons directly on the Live Activity.
**Why:** Differentiates from Hevy's timer-only Live Activity. More context without opening the app.
**Depends on:** expo-widgets exiting alpha, Approach B Live Activity working in production.
**Context:** Design doc Approach C. Deferred because it increases alpha surface area. Revisit when expo-widgets has a stable release.

### Test Framework Setup
**What:** ~~Set up Vitest (or Jest)~~ Jest is set up. Remaining: add React Native Testing Library, write tests for the rest timer state machine (completeRest, handleBeginSet, handleExtendRest, handleSkipRest) and notification flow.
**Why:** Timer state machine and notification lifecycle have zero test coverage. 47 tests exist for auth, API retry, and greeting context, but the workout screen's core state transitions are untested.
**Priority:** P1
**Context:** Jest config in `jest.config.js`, mocks in `__mocks__/`, existing tests in `__tests__/`. Coverage audit from PR #4 shows ~55% overall, 0% on workout.js and notifications.js.

### Account Linking (merge auth providers)
**What:** Add `linkWithCredential()` support so users can connect multiple sign-in methods (e.g., link Google to existing email/password account).
**Why:** Prevents data fragmentation if a user signs up with email, then later wants to also use Google. Without linking, same email on different providers creates separate Firebase UIDs with separate data.
**Effort:** M (human) / S (CC+gstack)
**Depends on:** Google + Apple Sign-In feature (shipped)
**Context:** Firebase docs on account linking. Add a "Linked Accounts" section in profile screen (`app/(tabs)/profile.js`). Use `linkWithCredential()` from `firebase/auth`.

### iOS CI Build
**What:** Add iOS build step to `.github/workflows/build-mobile.yml`.
**Why:** Apple Sign-In is iOS-only. Without iOS CI, build regressions are caught manually. Current CI only builds Android.
**Effort:** S (human) / S (CC+gstack)
**Depends on:** Apple Developer account + EAS iOS signing credentials configured
**Context:** Add `eas build --platform ios --profile preview --non-interactive` step to the existing workflow. Requires EAS credentials as GitHub secrets.

### Training Intelligence Service (Approach C)
**What:** Extract a dedicated `TrainingIntelligence` service that maintains a running model of the user's training state: muscle group fatigue levels, progressive overload readiness per exercise, weekly volume targets vs actuals, and deload signals. Agents query this service instead of raw DB functions.
**Why:** The current approach (Approach B) passes raw history to AI prompts and relies on the LLM to reason about muscle group balance, fatigue, and progressive overload. A dedicated service would compute these deterministically, making AI decisions more consistent and reducing prompt size. Also enables auto-triggered plan adjustments when the user's actual training diverges from their plan.
**Effort:** L (human) / M (CC+gstack)
**Priority:** P2
**Depends on:** Approach B (history-aware context) shipped and validated with real users
**Context:** Identified during CEO review 2026-03-31. The ideal long-term architecture, but premature for a pre-PMF app. Revisit after validating that history-aware prompts (Approach B) meaningfully improve workout quality from user feedback.

## Bugs (from adversarial review, PR #4)

### Background notification handler opens anonymous DB after app kill
**What:** `_layout.js` background event handler calls `getActiveRestTimer()` without a UID. After app kill + restore, `getDatabase()` opens `aura.db` (anonymous) instead of `aura_<uid>.db`. The +15s extend from lock screen silently fails because the timer row doesn't exist in the anonymous DB.
**Why:** Users who tap "+15s" on the lock screen notification after the app was killed think the timer extended, but it didn't.
**Priority:** P2
**Context:** Architectural limitation. Background handlers don't have auth state. Options: persist timer to a UID-independent table, store active UID in AsyncStorage for background access, or accept the limitation and document it.
**File:** `app/_layout.js:23-45`

### ~~Sync queue getDatabase() without UID race condition~~ ✅ Fixed
**Fixed:** All 4 `getDatabase()` calls in `sync.js` now pass `uid`. Added `currentUid` guards on realtime listener callbacks to prevent writes after teardown.

### Sync queue cleanup race — phantom failed entries
**What:** `attemptFirestoreWrite` dequeues sync items by `(collection, document_id)` query after a successful write. If `queueSync`'s INSERT hasn't committed by the time the cleanup query runs (both are async), the item stays in the queue forever. It retries, succeeds again (idempotent), but is never deleted. Eventually marked 'failed' after max retries, inflating `syncStatus.pendingCount` in the UI.
**Why:** User sees a growing error count even though all data is actually synced.
**Priority:** P2
**Context:** Fix: `await queueSync()` before the immediate write attempt, or delete by primary key instead of `(collection, document_id)`.
**File:** `lib/sync.js:250-258`

### JSON.parse on navigation params without try/catch
**What:** `workout.js` lines 26-27 do `JSON.parse(dayJson)` and `JSON.parse(locationJson)` without try/catch. React Native navigation can silently truncate large JSON params (Android Intent extras have ~500KB limits). A truncated JSON string throws `SyntaxError`, crashing the workout screen with a red screen.
**Why:** The workout plan JSON can be large (7-day plan with exercises, instructions, muscle groups). A crash here means the user can't start their workout.
**Priority:** P1
**Context:** Fix: wrap both `JSON.parse` calls in try/catch with fallback to null.
**File:** `app/workout.js:26-27`

### Volume query not unit-normalized in getRecentProgressSummary
**What:** `getRecentProgressSummary` sums `weight * reps` without checking `weight_unit`. A user who switches between lbs and kg, or has mixed entries, gets wrong volume trends. Other volume queries in the same file (e.g., `getWeeklyVolume` at line 788) correctly normalize with `CASE WHEN weight_unit = 'lbs' THEN weight * 0.453592 ELSE weight END`.
**Why:** The volume trend percentage feeds into the AI greeting context. A unit switch artifact could show a fake 120% volume increase, making the AI greeting misleading.
**Priority:** P2
**Context:** Fix: replace `s.weight * s.reps` with the unit-normalized version in both volume subqueries.
**File:** `lib/database.js:1123-1129`

### getPersonalRecords improvement percentage always 0%
**What:** The `second_best` CTE in `getPersonalRecords` uses `MAX(weight_normalized)`, which returns the same all-time maximum as the `best` CTE. `improvement_pct` is always `(best - best) / best = 0`. The progress screen never shows any improvement percentage for PRs.
**Why:** Users never see how much they improved on a PR, which is one of the most motivating data points in fitness tracking.
**Priority:** P2
**Context:** Fix: use `MAX` excluding the best weight (filter to rows where `weight_normalized < (SELECT MAX(...))`) or use `RANK()` window function.
**File:** `lib/database.js:915-936`

### Duration estimate magic numbers scattered across 5+ files
**What:** Workout duration is estimated using a magic number (minutes per exercise) in 5+ locations: `server/agents/memory.js:132`, `server/routes/agent.js:63`, `components/InlineWorkoutCard.js:13`, `server/agents/router.js:115`, `app/change-focus.js:74`, `app/workout-summary.js:46`. All currently use 8, but the lack of a shared constant means future edits risk re-introducing the mismatch bug fixed in PR #4.
**Why:** The duration mismatch bug (greeting said 24 min, card said 48 min) was caused by this exact pattern. A shared constant prevents recurrence.
**Priority:** P3
**Context:** Extract to a shared constant (e.g., `MINUTES_PER_EXERCISE = 8`) importable by both server and client code.
**Files:** `server/agents/memory.js`, `server/routes/agent.js`, `components/InlineWorkoutCard.js`, `server/agents/router.js`, `app/change-focus.js`, `app/workout-summary.js`
