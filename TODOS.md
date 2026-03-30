# TODOS

## Deferred Work

### Full Workout Dashboard Live Activity (Approach C)
**What:** Upgrade Live Activity from timer-only to full workout dashboard: exercise name, set 3/4, rest countdown, with interactive "Begin Set" and "+15s" buttons directly on the Live Activity.
**Why:** Differentiates from Hevy's timer-only Live Activity. More context without opening the app.
**Depends on:** expo-widgets exiting alpha, Approach B Live Activity working in production.
**Context:** Design doc Approach C. Deferred because it increases alpha surface area. Revisit when expo-widgets has a stable release.

### Test Framework Setup
**What:** Set up Vitest (or Jest) + React Native Testing Library. Write initial tests for the rest timer state machine and notification flow.
**Why:** 35 untested codepaths in the timer feature alone. Every feature shipped without tests increases the blast radius of future changes.
**Context:** Coverage diagram in eng review test plan: `~/.gstack/projects/dngreen04-01-Personal-Aura/damiengreen-main-eng-review-test-plan-20260329-193837.md`. The rest timer state machine (completeRest, handleBeginSet, handleExtendRest, handleSkipRest) is exactly the kind of code that benefits from unit tests.

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
