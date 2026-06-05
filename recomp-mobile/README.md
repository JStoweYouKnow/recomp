# RefactorAndroid (native Kotlin)

Single-module Android app (**Jetpack Compose**) with the same **`applicationId`** as the legacy Expo config: **`com.recomp.app`**.

## Requirements

- JDK **17**
- Android SDK **35** (Android Studio)

## Open & run

1. Open **`recomp-mobile`** in Android Studio, sync Gradle, run **app**.
2. Or from a terminal:

```bash
cd recomp-mobile
printf 'sdk.dir=%s/Library/Android/sdk\n' "$HOME" > local.properties
./gradlew :app:assembleDebug
```

**`sdk.dir` errors:** fix `local.properties` to your SDK path (often `~/Library/Android/sdk` on macOS).

APK: `app/build/outputs/apk/debug/app-debug.apk`

## Authentication

The API uses **`X-Refactor-User-Id`** (see `src/lib/auth.ts`). After **`POST /api/auth/login`**, **`userId`** is stored in **`EncryptedSharedPreferences`** (`SessionStore`). **`HttpClient`** adds the header on every request (`createHttpClient`).

Cold start: **`GET /api/auth/me`**; invalid session clears storage.

## Sync (Room + `GET /api/data/sync`)

Successful sync GETs are stored as **raw JSON** in **`sync_cache`**. **`ignoreUnknownKeys`** keeps the client tolerant of new server fields.

The client decodes a growing slice of the payload, including **`profile`**, **`meta`** (xp, hasAdjusted, ricoHistory), **`meals`**, **`plan`** (workout + **`dietPlan.dailyTargets`**), **`workoutProgress`**, **`milestones`**, wearables, **`hydration`**, **`fastingSessions`**, **`biofeedback`**, **`pantry`**, **`activityLog`**, and more—aligned with `src/lib/sync-schema.ts`.

**Upload:** **`POST /api/data/sync`** rebuilds the body from cache (`buildSyncPushPayload`). **Today** and flows that call **`pushCachedSnapshot()`** surface results via Snackbar where implemented.

**503:** Sync GET can return **503** when Dynamo is not configured locally; use a deployed API or full stack.

## Navigation (iOS `MainTabView` parity)

Bottom tabs (**7**), same order as iOS shell:

| Tab | Screen |
|-----|--------|
| **Today** | Dashboard: greeting, calorie budget + macros, workout highlight, hydration / fasting / biofeedback widgets, daily quests, sync refresh + upload |
| **Meals** | Segmented **Meals · Pantry · Meal prep** — logged meals (edit/push), pantry CRUD (sync `pantry[]`), meal prep **`POST /api/meal-prep/generate`** |
| **Training** | Weekly plan from sync, **per-set completion** (web/iOS `workoutProgress` keys), progress summary card, **recovery** (`POST /api/workouts/recovery-adjust`), **exercise GIF** search |
| **Adjust** | Plan adjustment copy + refresh (sync-backed) |
| **Progress** | Milestones from sync |
| **Groups** | Mine / Discover / Challenges, detail (chat, leaderboard, members), create / join / leave — same REST routes as iOS `GroupAPI` |
| **Profile** | Hub: biometric toggle, synced profile, wearables, research, music (opens Spotify), subscription (**`proAccess`** + **Google Play Billing** when `PLAY_SUBSCRIPTION_ID` is set), **Sign out** |

**FAB:** Coach chat → **`POST /api/rico`** with Rico context from cache; tool actions merge via **`RicoSyncActionApplier`**; coach history can be merged into snapshot before push.

## API base URL (`BuildConfig`)

| Build type | `API_BASE_URL` | Use case |
|------------|----------------|----------|
| debug | `http://10.0.2.2:3000` | Emulator → host :3000 |
| release | `https://recomp-one.vercel.app` | Production |

## Push, widget, biometrics, speech

- **WorkManager:** periodic sync when logged in.
- **FCM:** `POST /api/push/subscribe-fcm` when Firebase Gradle fields are set (`gradle.properties` / `google-services.json`); server needs **`FIREBASE_SERVICE_ACCOUNT_JSON`** for delivery.
- **Widget:** `RecompAppWidgetProvider` from last snapshot.
- **Biometrics:** **Profile** hub toggle + **`BiometricGate`** after backgrounding.
- **Speech:** Coach mic via **SpeechRecognizer**.

## CI

Root **`/.github/workflows/ci.yml`** runs **`:app:compileDebugKotlin`** with web checks.

## Known gaps vs iOS (non-exhaustive)

- **Workout set completion / `workoutProgress` keys:** Android Training tab uses the same **`WorkoutWebProgress`** key rules as iOS/web; per-set checkboxes update **`workoutProgress`** and **`pushCachedSnapshot()`** when all sets for a row are done (local prefs mirror iOS `WorkoutService` merge behavior).
- **Google Play Billing:** integrated (Billing Library 7.x, Profile → Subscription). Set **`PLAY_SUBSCRIPTION_ID`** in `gradle.properties` to your Play Console subscription SKU. Server verify: **`POST /api/billing/google-play/verify`** (extend with Google Play Developer API when ready).
- **Profile “power user” tools:** notifications, API tokens, supplements, blood work, calendar feed, etc. from iOS **ProfileView** are not all ported—only the hub entries above.

## Recommended next implementation order

1. **Server-side Play verification** — implement `androidpublisher` in `src/app/api/billing/google-play/verify/route.ts` and persist Pro entitlements (today the route authenticates and accepts the payload only).
2. **Remaining ProfileView surfaces** — pick by usage (notifications, tokens, health sections).

Gradle `rootProject.name` is **RefactorAndroid**; module is **`:app`**.
