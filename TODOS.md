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

### ~~Background notification handler opens anonymous DB after app kill~~ ✅ Fixed
**Fixed:** UID is now persisted to AsyncStorage and restored in the background notification handler. See commit `46e42b8`.

### ~~Sync queue getDatabase() without UID race condition~~ ✅ Fixed
**Fixed:** All 4 `getDatabase()` calls in `sync.js` now pass `uid`. Added `currentUid` guards on realtime listener callbacks to prevent writes after teardown.

### ~~Sync queue cleanup race — phantom failed entries~~ ✅ Fixed
**Fixed:** `pushToCloud` now chains `queueSync()` before `attemptFirestoreWrite()`, and cleanup deletes by primary key instead of querying by `(collection, document_id)`. See commit `87e5a89`.

### ~~JSON.parse on navigation params without try/catch~~ ✅ Fixed
**Fixed:** Both `JSON.parse` calls in `workout.js` are now wrapped in try/catch with fallback to `null`. Truncated JSON from Android Intent extras no longer crashes the workout screen.

### ~~Volume query not unit-normalized in getRecentProgressSummary~~ ✅ Fixed
**Fixed:** Both volume subqueries in `getRecentProgressSummary` now normalize with `CASE WHEN s.weight_unit = 'lbs' THEN s.weight * 0.453592 ELSE s.weight END`, matching the pattern used by `getWeeklyVolume` and other volume queries.

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
