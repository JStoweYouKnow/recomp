# Recomp Mobile

React Native (Expo) iOS app for Recomp — AI-powered body recomposition.

## Setup

1. **Install dependencies** (from repo root or recomp-mobile):

   ```bash
   cd recomp-mobile
   npm install
   ```

   If you hit npm cache errors, try: `npm cache clean --force` then `npm install`.

2. **Start the web API** (required for auth and plan generation):

   ```bash
   cd ../recomp
   npm run dev
   ```

3. **Configure API URL** (optional):

   For a physical device, set your machine's LAN IP in `src/lib/config.ts` or use `EXPO_PUBLIC_API_URL` in `.env`:

   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.x:3000
   ```

   Simulator can use `http://localhost:3000`.

4. **Run the app**:

   ```bash
   npm run ios
   ```

## Phase 0 (complete)

- [x] Expo project scaffold
- [x] Design tokens (theme.ts)
- [x] Core components (Button, Card, Input, Badge)
- [x] API client with `X-Recomp-User-Id` header
- [x] Auth store (Zustand + SecureStore)
- [x] Navigation (Auth stack → Main tabs)
- [x] Onboarding screen (form)

## Phase 1 (complete)

- [x] Data store (plan, meals, activityLog, workoutProgress) + AsyncStorage
- [x] Sync to server (`/api/data/sync`)
- [x] Plan generation after onboarding
- [x] TodayAtAGlance component (budget bar, macros, mini cards)
- [x] Calendar component (week view, date select)
- [x] Dashboard screen
- [x] Meals screen (list + calendar filter)
- [x] Workouts screen (day view + exercise list)
- [x] Profile screen (read-only)
- [x] More tab (Adjust, Wearables, Milestones placeholders)
- [x] Demo mode banner

## Backend

The web API (`recomp`) accepts `X-Recomp-User-Id` for mobile clients. Cookie auth remains for web.
