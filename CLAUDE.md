# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aura is an AI-powered fitness coaching mobile app built with React Native (Expo) and a Node.js/Express backend. The app provides real-time chat coaching via Gemini AI, structured workout logging with progressive overload tracking, and dynamic program regeneration.

## Development Commands

```bash
# Full stack (frontend + backend concurrently)
npm run dev

# Frontend only (Expo dev server)
npm start
npm run ios          # iOS simulator
npm run android      # Android emulator

# Backend only (Express server on port 3001)
npm run server

# Reset Expo cache
npx expo start -c
```

```bash
# Run tests
npx jest              # All tests
npx jest --watch      # Watch mode
```

## Architecture

### Frontend (Expo Router, file-based routing)

- **`app/_layout.js`** — Root layout: font loading, splash screen, Google Sign-In config, background notification handlers
- **`app/auth.js`** — Auth screen: email/password, Google Sign-In, Apple Sign-In (disabled), password reset
- **`app/index.js`** — Entry redirect: checks onboarding status in SQLite, routes to onboarding or tabs
- **`app/onboarding.js`** — Multi-step onboarding: goal, equipment, strength baselines, plan generation
- **`app/workout.js`** — Active workout screen: set logging, persistent rest timer, Begin Set modal, AI chat, exercise swaps
- **`app/workout-summary.js`** — Pre-workout review: exercise list with swap widget
- **`app/(tabs)/`** — Tab navigation: Chat (`index.js`), Progress (`progress.js`), Profile (`profile.js`)

### Backend (`server/`)

- **`server/index.js`** — Express app entry, route mounting, CORS, health check
- **`server/routes/coach.js`** — Gemini Flash-Lite for real-time coaching with function calling (`log_set`, `suggest_swap`)
- **`server/routes/onboarding.js`** — Gemini 2.5 Flash for initial 7-day plan generation
- **`server/routes/programmer.js`** — Gemini Pro batch API for async plan regeneration
- **`server/routes/progress.js`** — Analytics/insights endpoint

### Shared Libraries (`lib/`)

- **`lib/database.js`** — SQLite schema, migrations, all CRUD operations. Tables: `user_profile`, `workout_plans`, `workout_sessions`, `workout_sets`, `exercise_unit_preferences`, `agent_interactions`, `rest_timers`. Includes `getTrainingContext(days)` for 7-day training history with muscle groups and exercise weights.
- **`lib/contextBuilder.js`** — Unified `buildUserContext()` builder. Accepts profile, workout, exercise, progression, location, motivation, and trainingContext. Output is backward-compatible with server's `buildAgentContext()`.
- **`lib/auth.js`** — Firebase auth: Google Sign-In, Apple Sign-In, email/password, token management
- **`lib/notifications.js`** — Notification system: persistent rest timer countdown, alarm sound, action buttons (Begin Set, +15s)
- **`lib/api.js`** — HTTP client with auto-detection of dev (localhost:3001) vs production (Cloud Run URL)
- **`lib/theme.js`** — Design tokens: colors (primary: `#d4ff00`), spacing scale, border radii, font definitions
- **`lib/weightUtils.js`** — kg/lbs conversion utilities

### Key Patterns

- **State**: React hooks only (no Redux/Zustand). SQLite for persistence, React state for UI.
- **Styling**: `StyleSheet.create()` with theme tokens from `lib/theme.js`. Dark theme with lime-green accent.
- **API calls**: Raw `fetch()` with 90-second abort timeout. Environment-aware base URL in `lib/api.js`.
- **Database migrations**: `ALTER TABLE` checks in `initDatabase()` — new columns added via try/catch to handle existing schemas.
- **Navigation params**: Serialized as JSON strings via `useRouter().push()`.
- **Rest timer**: Stores end timestamp in SQLite for persistence across app kills. Polls at 250ms intervals. On completion, shows Begin Set modal with alarm sound instead of auto-advancing. Supports +15s extend from notification action buttons.
- **Weight units**: Per-exercise preference stored in SQLite. All internal aggregations normalize to kg.
- **Training context**: `getTrainingContext(7)` fetched via `Promise.allSettled` on chat screens. Passes recent sessions, muscle group recency, and exercise weight history to AI agents. Gracefully degrades to null if unavailable. Planning Agent uses this for 48-hour muscle avoidance and smart weight estimation.

### AI Integration (Multi-Agent Architecture)

| Model | Use | Latency |
|-------|-----|---------|
| `gemini-3.1-flash-lite-preview` | Orchestrator, coaching chat, onboarding, greeting, progress insights | ~1-2s |
| `gemini-3.1-pro-preview` | Planning Agent: workout generation, modification, progressive overload | ~5-10s |
| `gemini-3.1-flash-image-preview` | Visual Agent: exercise instructional images and animated GIFs | ~3-5s |

### Deployment

- **Mobile**: Expo EAS builds
- **API**: Docker → Google Cloud Run (`server/Dockerfile`)
- **Production API**: `https://aura-api-177339568703.us-central1.run.app`

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
