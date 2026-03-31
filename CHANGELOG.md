# Changelog

All notable changes to Aura will be documented in this file.

## [1.0.2.0] - 2026-03-31

### Fixed
- Background notification handler now restores the correct user-scoped database after app kill. Tapping "+15s" or "Begin Set" on the lock screen actually works now.
- Sync queue no longer writes to the wrong database during account transitions. All `getDatabase()` calls in sync.js pass the user's UID.
- Phantom "failed sync" entries eliminated. Queue cleanup now chains properly and deletes by primary key instead of racing with the INSERT.
- Workout screen no longer crashes when Android truncates large JSON navigation params. Both `JSON.parse` calls wrapped in try/catch with null fallback.
- Volume trend in AI greeting context now normalizes weight units (kg/lbs) correctly, preventing fake volume spikes when switching units.
- Personal records improvement percentage actually shows improvement now. The second-best CTE was comparing the PR against itself (always 0%).
- Workout duration estimates use a shared `MINUTES_PER_EXERCISE` constant across all 6 files, preventing the greeting-says-24min-but-card-says-48min mismatch.
- Realtime sync listeners now check UID identity (not just null), preventing stale callbacks from switching the active database during account transitions.
- Notification alarms are always canceled on user action, even if the persisted UID is missing. No more infinite alarm loops.

## [1.0.1.0] - 2026-03-31

### Added
- AI agents now see your last 7 days of training before generating or modifying workouts. No more suggesting bench press the day after chest day.
- Smart weight recommendations: when you've logged an exercise before, the AI uses your actual weight history instead of generic body-weight-ratio estimates.
- Training history guardrails in the Planning Agent: 48-hour muscle group avoidance, gap-filling for undertrained groups, and ad-hoc replacement workouts labeled as one-off sessions.
- Orchestrator references recent training in pre-workout and mid-workout chat ("You hit legs hard yesterday, so today's upper body focus is good timing").

### Fixed
- Exercise weight tracking now uses the heaviest set instead of the first set, preventing warm-up weights from being reported as "last lifted."
- Secondary muscles (triceps from bench, biceps from rows) are now tracked in muscle group recency, preventing the AI from overworking recently loaded secondary groups.
- Malformed exercise cache data no longer crashes the entire training context query.
