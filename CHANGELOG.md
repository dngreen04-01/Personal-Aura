# Changelog

All notable changes to Aura will be documented in this file.

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
