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

No test runner or linter is currently configured.

## Architecture

### Frontend (Expo Router, file-based routing)

- **`app/_layout.js`** — Root layout: font loading, splash screen, navigation container
- **`app/index.js`** — Entry redirect: checks onboarding status in SQLite, routes to onboarding or tabs
- **`app/onboarding.js`** — Multi-step onboarding: goal, equipment, strength baselines, plan generation
- **`app/workout.js`** — Active workout screen: set logging, rest timer, AI chat, exercise swaps
- **`app/workout-summary.js`** — Pre-workout review: exercise list with swap widget
- **`app/(tabs)/`** — Tab navigation: Chat (`index.js`), Progress (`progress.js`), Profile (`profile.js`)

### Backend (`server/`)

- **`server/index.js`** — Express app entry, route mounting, CORS, health check
- **`server/routes/coach.js`** — Gemini Flash-Lite for real-time coaching with function calling (`log_set`, `suggest_swap`)
- **`server/routes/onboarding.js`** — Gemini 2.5 Flash for initial 7-day plan generation
- **`server/routes/programmer.js`** — Gemini Pro batch API for async plan regeneration
- **`server/routes/progress.js`** — Analytics/insights endpoint

### Shared Libraries (`lib/`)

- **`lib/database.js`** — SQLite schema, migrations, all CRUD operations. Tables: `user_profile`, `workout_plans`, `workout_sessions`, `workout_sets`, `exercise_unit_preferences`
- **`lib/api.js`** — HTTP client with auto-detection of dev (localhost:3001) vs production (Cloud Run URL)
- **`lib/theme.js`** — Design tokens: colors (primary: `#d4ff00`), spacing scale, border radii, font definitions
- **`lib/weightUtils.js`** — kg/lbs conversion utilities

### Key Patterns

- **State**: React hooks only (no Redux/Zustand). SQLite for persistence, React state for UI.
- **Styling**: `StyleSheet.create()` with theme tokens from `lib/theme.js`. Dark theme with lime-green accent.
- **API calls**: Raw `fetch()` with 90-second abort timeout. Environment-aware base URL in `lib/api.js`.
- **Database migrations**: `ALTER TABLE` checks in `initDatabase()` — new columns added via try/catch to handle existing schemas.
- **Navigation params**: Serialized as JSON strings via `useRouter().push()`.
- **Rest timer**: Stores end timestamp (not duration) so it survives app backgrounding; polls at 250ms intervals.
- **Weight units**: Per-exercise preference stored in SQLite. All internal aggregations normalize to kg.

### AI Integration (Dual-Model Strategy)

| Model | Use | Latency |
|-------|-----|---------|
| Gemini Flash-Lite | Real-time coach chat with function calling | ~1-2s |
| Gemini 2.5 Flash | Onboarding plan generation | ~5-10s |
| Gemini Pro (batch) | Async plan regeneration after 7+ sessions | Background |

### Deployment

- **Mobile**: Expo EAS builds
- **API**: Docker → Google Cloud Run (`server/Dockerfile`)
- **Production API**: `https://aura-api-177339568703.us-central1.run.app`
