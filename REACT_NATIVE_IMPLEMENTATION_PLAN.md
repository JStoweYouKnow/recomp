# Recomp — React Native Implementation Plan

**Senior UX/UI Mobile Design × Engineering Roadmap**  
Target: iOS-first, feature parity with web app, 2–3 month delivery window.

---

## 1. Strategic Overview

### 1.1 Design Principles (Mobile-First)

| Principle | Web → Mobile translation |
|-----------|--------------------------|
| **Touch-first** | 44pt minimum tap targets; replace hover with long-press/secondary actions |
| **Thumb zone** | Primary actions bottom-center; nav tabs bottom; FAB (Rico) stays bottom-right |
| **Reduced density** | One primary task per screen; progressive disclosure via sheets/modals |
| **Offline-aware** | Cache-first; optimistic updates; clear sync status in header |
| **Voice as primary** | Meal logging and Reco default to voice on mobile; text as fallback |

### 1.2 Information Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AUTH FLOW (one-time)                      │
│  Splash → Onboarding (form or voice) → Plan generation       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   MAIN APP (tab + modal)                      │
│                                                              │
│  TABS (bottom):     Dashboard | Meals | Workouts | More     │
│                                                              │
│  MODALS:            Rico Chat (FAB)                         │
│                     Calendar date picker                     │
│                     Log meal (text/voice/photo)              │
│                     Weekly review                            │
│                     Profile edit                             │
│                     Wearables connect                        │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Framework** | React Native (Expo SDK 52+) | OTA, managed workflow, easy HealthKit/APNs |
| **Navigation** | React Navigation 7 | Native stack, bottom tabs, modal presets |
| **Styling** | NativeWind (Tailwind for RN) | Parity with web design tokens |
| **State** | Zustand + React Query | Shared types with web; sync + cache |
| **Forms** | React Hook Form + Zod | Same schemas as `/api/auth/register` |
| **API** | Shared fetch + base URL | Point to existing Next.js API or Vercel deployment |

---

## 2. Phase Breakdown

### Phase 0: Foundation (Week 1)

**Deliverables:** Project scaffold, design system, API client, auth flow shell.

| Task | Priority | Est. | UX Notes |
|------|----------|------|----------|
| Init Expo project (iOS-only initially) | P0 | 0.5d | EAS Build for sim + device |
| Design tokens (colors, spacing, typography) | P0 | 1d | Port `globals.css` vars → NativeWind theme |
| Core component library (Button, Card, Input, Badge) | P0 | 1.5d | Match web `btn-primary`, `card`, `input-base` |
| API client + env config | P0 | 0.5d | `API_BASE_URL` for dev/staging/prod |
| Auth store (Zustand) + cookie/token persistence | P0 | 0.5d | Use SecureStore for `recomp_uid` |
| Navigation shell (tabs + stack) | P0 | 0.5d | Bottom tabs placeholder; modal stack |
| Onboarding screen (form only) | P0 | 1d | Same fields as `LandingPage`; no voice yet |

**Design System Tokens (port from web):**

```ts
// theme.ts – NativeWind / Tailwind config
colors: {
  background: '#faf8f5',
  foreground: '#3d3730',
  accent: '#6b7c3c',
  accentHover: '#5a6b2e',
  muted: '#9a9389',
  surface: '#f5f1ec',
  border: '#e0d9d0',
}
fontSize: { caption: 11, small: 13, body: 15, h6..h1 }
spacing: { 1: 4, 2: 8, 3: 12, 4: 16, ... }
radius: { sm: 6, md: 10, lg: 14, xl: 18 }
```

---

### Phase 1: Core Experience (Weeks 2–3)

**Deliverables:** Dashboard, Meals, Workouts, basic Profile. No voice/photo yet.

| Task | Priority | Est. | UX Notes |
|------|----------|------|----------|
| Dashboard screen | P0 | 2d | TodayAtAGlance first; calendar below |
| Today at a Glance component | P0 | 1d | Caloric budget bar, macro pills, mini cards |
| Unified Calendar component | P0 | 1.5d | Horizontal scroll or week view; date picker sheet |
| Meals list + calendar filter | P0 | 1d | Reuse Calendar; meal cards with edit/delete |
| Workouts list + day view | P0 | 1d | Single-day workout; exercise list + demo toggle |
| Exercise demo (GIF/images) | P1 | 0.5d | `expo-image` or FastImage |
| Profile screen | P0 | 1d | Read-only first; edit in Phase 3 |
| Data sync (AsyncStorage ↔ API) | P0 | 1d | `syncToServer()` equivalent; background sync |
| Demo mode banner | P1 | 0.25d | Sticky top; same copy as web |

**Screen Specs:**

- **Dashboard:** Sticky header with logo; scroll: TodayAtAGlance → Calendar → Weekly Review CTA → Wearables CTA.
- **Meals:** Tab bar "Meals"; FAB "Log meal" → opens Log Meal sheet (Phase 2).
- **Workouts:** Calendar → select date → workout card with exercises; "Show demo" per exercise.

---

### Phase 2: Meal Logging & Reco (Weeks 4–5)

**Deliverables:** 4-way meal logging (text, voice, photo, receipt); Rico AI coach.

| Task | Priority | Est. | UX Notes |
|------|----------|------|----------|
| Log Meal bottom sheet | P0 | 0.5d | Tabs: Text | Voice | Photo | Receipt |
| Text meal input | P0 | 0.5d | Food name + optional macros; suggest API |
| Voice meal logging | P0 | 1.5d | `expo-av` or react-native-audio-api; stream to `/api/voice/sonic/stream` |
| Photo meal logging | P0 | 1d | `expo-image-picker` → `/api/meals/analyze-photo` |
| Receipt scan | P1 | 0.5d | Same picker → `/api/meals/analyze-receipt` |
| Rico chat modal | P0 | 1.5d | Full-screen modal; text + voice turns |
| Rico voice mode | P0 | 1d | Same streaming pattern as meal voice |
| Offline/error states | P1 | 0.5d | Retry, fallback to text |

**UX Decisions:**

- Default to **Voice** on Log Meal sheet (mobile-first).
- Rico FAB: bottom-right, 56pt; opens full-screen chat.
- Voice recording: hold-to-talk or tap-to-talk with clear recording indicator.

---

### Phase 3: Plan Generation & Adjustments (Week 6)

**Deliverables:** Plan generation, Adjust flow, profile edit, regenerate plan.

| Task | Priority | Est. | UX Notes |
|------|----------|------|----------|
| Plan generation loading state | P0 | 0.5d | Skeleton or progress; 30–60s typical |
| Adjust screen | P0 | 1d | Feedback textarea; submit → loading → result cards |
| Apply adjustments CTA | P0 | 0.5d | Update plan in store + sync |
| Profile edit screen | P0 | 1d | Form matching onboarding; save → sync |
| Regenerate plan (Dashboard) | P1 | 0.5d | Confirmation dialog; loading overlay |
| Plan edit from calendar | P1 | 0.5d | Edit workout/diet from calendar popup |

---

### Phase 4: Wearables & Advanced (Weeks 7–8)

**Deliverables:** Oura, Fitbit, HealthKit; weekly review; milestones; transformation preview.

| Task | Priority | Est. | UX Notes |
|------|----------|------|----------|
| Wearables list screen | P0 | 0.5d | Cards: Oura, Fitbit, Apple Health, Import |
| Oura connect | P0 | 0.5d | Token input; `POST /api/wearables/oura/connect` |
| Fitbit OAuth | P0 | 1d | `expo-auth-session` or WebBrowser for OAuth |
| HealthKit native module | P0 | 1.5d | Expo config plugin + native bridge; request permissions |
| HealthKit → API | P0 | 0.5d | POST to `/api/wearables/apple/healthkit` |
| Weekly review card + generate | P0 | 1d | Button → loading → expandable result |
| Milestones screen | P1 | 0.5d | Badge grid, XP, progress bars |
| Transformation preview | P1 | 0.5d | Photo picker → `/api/images/after` |
| Push notifications | P1 | 1d | APNs; subscribe endpoint; `expo-notifications` |

---

### Phase 5: Polish & Ship (Weeks 9–10)

**Deliverables:** Onboarding voice, accessibility, performance, TestFlight.

| Task | Priority | Est. | UX Notes |
|------|----------|------|----------|
| Voice onboarding | P1 | 1d | Same flow as web; Nova Sonic conversation |
| Accessibility (VoiceOver, Dynamic Type) | P0 | 1d | Labels, roles, hitSlop |
| Haptics | P1 | 0.25d | Success/error feedback on key actions |
| Pull-to-refresh | P1 | 0.25d | Dashboard, Meals, sync |
| Error boundaries | P0 | 0.25d | Fallback UI + retry |
| EAS Build + TestFlight | P0 | 0.5d | Internal testing |
| App Store assets | P1 | 0.5d | Screenshots, description, privacy |

---

## 3. Component Map (Web → React Native)

| Web component | RN component | Notes |
|--------------|-------------|-------|
| `LandingPage` | `OnboardingScreen` | Form + optional voice flow |
| `Dashboard` | `DashboardScreen` | Compose TodayAtAGlance, Calendar, cards |
| `TodayAtAGlance` | `TodayAtAGlance` | Budget bar, macro pills, mini cards |
| `CalendarView` | `CalendarView` | Horizontal week; date select |
| `MealsView` | `MealsScreen` | List + Log Meal FAB |
| `WorkoutPlannerView` | `WorkoutsScreen` | Day view + exercise list |
| `ProfileView` | `ProfileScreen` | Form with avatar |
| `WearablesView` | `WearablesScreen` | Provider cards |
| `AdjustView` | `AdjustScreen` | Feedback + result |
| `MilestonesView` | `MilestonesScreen` | Badges + XP |
| `RicoChat` | `RicoChatModal` | Full-screen modal |
| `TransformationPreview` | `TransformationPreview` | In Dashboard or Profile |
| `WeeklyReviewCard` | `WeeklyReviewCard` | In Dashboard |
| `GrocerySearch` | Defer / P2 | Nova Act not applicable; optional link to web |
| `ShoppingList` | `ShoppingList` | Simple list in Dashboard |

---

## 4. Navigation Structure

```ts
// Root navigator
RootStack
├── AuthStack (no tabs)
│   ├── Splash
│   └── Onboarding
└── MainStack (with tabs)
    ├── MainTabs
    │   ├── DashboardTab
    │   ├── MealsTab
    │   ├── WorkoutsTab
    │   └── MoreTab (Adjust, Wearables, Milestones, Profile)
    └── Modals (overlays)
        ├── RicoChat
        ├── LogMeal
        ├── CalendarDatePicker
        ├── WeeklyReview
        └── EditProfile
```

**More tab:** List of secondary screens (Adjust, Wearables, Milestones, Profile) to reduce tab clutter.

---

## 5. Data & Sync Strategy

| Data | Storage | Sync trigger |
|------|---------|--------------|
| Profile | Zustand + AsyncStorage | On change, debounced |
| Plan | Zustand + AsyncStorage | After generate/adjust |
| Meals | Zustand + AsyncStorage | On add/delete |
| Wearable data | Zustand + AsyncStorage | After fetch |
| Milestones, XP | Zustand + AsyncStorage | After compute |
| Rico history | AsyncStorage | Per message |

**Sync flow:** `syncToServer()` batches plan, meals, milestones, meta → `POST /api/data/sync`. Run on app foreground, after mutations, and optionally in background (expo-background-fetch).

---

## 6. Native Modules & Permissions

| Feature | Module | Permissions (Info.plist) |
|---------|--------|--------------------------|
| Camera | expo-image-picker | NSCameraUsageDescription, NSPhotoLibraryUsageDescription |
| Microphone | expo-av / react-native-audio-api | NSMicrophoneUsageDescription |
| HealthKit | Custom config plugin | HealthKit entitlements, NSHealthShareUsageDescription |
| Push | expo-notifications | Push Notifications capability |

---

## 7. Out of Scope (V1)

| Feature | Reason |
|---------|--------|
| Nova Act (grocery automation) | Browser-only; link to web for add-to-cart |
| Nova Reel (video generation) | Nice-to-have; defer |
| Cooking app webhooks | Same API; no mobile-specific UI |
| Android | iOS-first; add in V1.1 |

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Voice streaming latency | Test on device; consider chunked upload if streaming API is slow |
| HealthKit approval | Use clearly scoped permissions; document in App Store |
| API compatibility | Ensure web API accepts same JSON; no cookie dependency (use header or token) |
| Design drift | Lock design tokens in Phase 0; review screens against web weekly |

---

## 9. Success Metrics

- [ ] Feature parity with web (excluding Nova Act)
- [ ] Sub-second perceived load for Dashboard
- [ ] Voice meal logging < 3s to first response
- [ ] HealthKit sync works with Apple Watch data
- [ ] Offline: core flows work with cached data; sync on reconnect

---

**Timeline summary:** 10 weeks, 1 developer, iOS-only. Android add 2–3 weeks with shared components.
