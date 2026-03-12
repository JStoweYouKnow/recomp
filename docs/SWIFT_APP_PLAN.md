# Recomp Swift App Plan

> Full feature parity with the web app + native Apple Watch companion

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Structure](#2-project-structure)
3. [Data Layer](#3-data-layer)
4. [Networking & API](#4-networking--api)
5. [Authentication](#5-authentication)
6. [Feature Modules](#6-feature-modules)
7. [Apple Watch App](#7-apple-watch-app)
8. [Native Platform Integrations](#8-native-platform-integrations)
9. [Offline-First & Sync](#9-offline-first--sync)
10. [Dependencies](#10-dependencies)
11. [Build & Distribution](#11-build--distribution)
12. [Migration & Rollout Phases](#12-migration--rollout-phases)

---

## 1. Architecture Overview

### Pattern: MVVM + Coordinator

| Layer | Responsibility |
|-------|----------------|
| **View** | SwiftUI views — declarative, stateless where possible |
| **ViewModel** | `@Observable` classes that own screen state, call services |
| **Service** | Protocol-oriented service layer (`MealService`, `PlanService`, etc.) |
| **Repository** | Abstraction over local (SwiftData) + remote (API) data |
| **Coordinator** | `NavigationPath`-based routing; deep links, tab management |

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **SwiftUI** (iOS 17+ / watchOS 10+) | `@Observable` macro, `NavigationStack`, `SwiftData`, native animations |
| **SwiftData** over Core Data | First-class SwiftUI integration, simpler model definitions, automatic CloudKit option |
| **Structured Concurrency** (`async/await`, actors) | Eliminates callback pyramids; safe shared state via `@MainActor` |
| **Swift Package Manager** | First-party, Xcode-integrated dependency management |
| **Shared Swift package** between iOS and watchOS | Maximizes code reuse for models, services, networking |

### Target Deployment

| Platform | Minimum OS | UI Framework |
|----------|-----------|--------------|
| iPhone | iOS 17.0 | SwiftUI |
| Apple Watch | watchOS 10.0 | SwiftUI |

---

## 2. Project Structure

```
Recomp/
├── Recomp.xcodeproj
├── RecompApp/                         # iOS app target
│   ├── App/
│   │   ├── RecompApp.swift            # @main, WindowGroup, scene config
│   │   ├── AppCoordinator.swift       # Root NavigationPath, tab state
│   │   └── AppDelegate.swift          # APNs registration, background tasks
│   ├── Features/
│   │   ├── Onboarding/
│   │   │   ├── OnboardingView.swift
│   │   │   ├── OnboardingViewModel.swift
│   │   │   ├── VoiceOnboardingView.swift
│   │   │   └── SignUpFormView.swift
│   │   ├── Dashboard/
│   │   │   ├── DashboardView.swift
│   │   │   ├── DashboardViewModel.swift
│   │   │   ├── CalorieBudgetCard.swift
│   │   │   ├── MacroPillsView.swift
│   │   │   ├── ActivityLogCard.swift
│   │   │   ├── HydrationWidget.swift
│   │   │   ├── FastingWidget.swift
│   │   │   ├── BiofeedbackCard.swift
│   │   │   ├── MetabolicModelCard.swift
│   │   │   ├── WeeklyCalendarStrip.swift
│   │   │   ├── DailyQuestsCard.swift
│   │   │   ├── DuelCard.swift
│   │   │   ├── GrocerySearchView.swift
│   │   │   ├── ShoppingListView.swift
│   │   │   └── WeeklyReviewCard.swift
│   │   ├── Meals/
│   │   │   ├── MealsView.swift
│   │   │   ├── MealsViewModel.swift
│   │   │   ├── AddMealSheet.swift
│   │   │   ├── VoiceMealLogger.swift
│   │   │   ├── PhotoMealAnalyzer.swift     # Camera / photo picker
│   │   │   ├── ReceiptScanner.swift
│   │   │   ├── MenuScanner.swift
│   │   │   ├── RecipeURLImporter.swift
│   │   │   ├── SimilarMealsView.swift
│   │   │   ├── MealInspirationView.swift   # Nova Canvas images
│   │   │   ├── PantryView.swift
│   │   │   ├── MealPrepView.swift
│   │   │   └── CookingAppImportView.swift
│   │   ├── Workouts/
│   │   │   ├── WorkoutsView.swift
│   │   │   ├── WorkoutsViewModel.swift
│   │   │   ├── WorkoutDayCard.swift
│   │   │   ├── ExerciseDemoView.swift      # GIF playback
│   │   │   ├── SetTrackerView.swift
│   │   │   └── WorkoutEditView.swift
│   │   ├── Adjust/
│   │   │   ├── AdjustView.swift
│   │   │   └── AdjustViewModel.swift
│   │   ├── Progress/                       # (Milestones)
│   │   │   ├── ProgressView.swift
│   │   │   ├── ProgressViewModel.swift
│   │   │   ├── BadgesGrid.swift
│   │   │   ├── XPLevelView.swift
│   │   │   ├── MeasurementsView.swift
│   │   │   ├── SmartScaleEntryView.swift
│   │   │   ├── WearableDataTable.swift
│   │   │   ├── ProgressPhotosView.swift    # Camera capture
│   │   │   ├── ProgressReelView.swift      # Nova Reel video
│   │   │   ├── WeeklyRecapCard.swift
│   │   │   └── BiofeedbackInsightsView.swift
│   │   ├── Groups/
│   │   │   ├── GroupsView.swift
│   │   │   ├── GroupsViewModel.swift
│   │   │   ├── GroupDetailView.swift
│   │   │   ├── GroupChatView.swift
│   │   │   ├── GroupActivityView.swift
│   │   │   ├── GroupMembersView.swift
│   │   │   ├── GroupChallengesView.swift
│   │   │   ├── CreateGroupSheet.swift
│   │   │   └── InviteCodeView.swift
│   │   ├── Profile/
│   │   │   ├── ProfileView.swift
│   │   │   ├── ProfileViewModel.swift
│   │   │   ├── WearableConnectionsView.swift
│   │   │   ├── CalendarFeedView.swift
│   │   │   ├── SocialSettingsView.swift
│   │   │   ├── PushNotificationSettings.swift
│   │   │   ├── CoachScheduleView.swift
│   │   │   ├── SupplementsView.swift
│   │   │   ├── BloodWorkView.swift
│   │   │   └── ClaimAccountView.swift
│   │   ├── Coach/                          # (Rico AI Chat)
│   │   │   ├── CoachChatView.swift
│   │   │   ├── CoachChatViewModel.swift
│   │   │   └── CoachVoiceSession.swift
│   │   ├── PublicProfile/
│   │   │   └── PublicProfileView.swift
│   │   └── Research/
│   │       └── ResearchView.swift
│   ├── SharedUI/
│   │   ├── MacroRing.swift
│   │   ├── CalendarStripView.swift
│   │   ├── LoadingOverlay.swift
│   │   ├── ToastModifier.swift
│   │   ├── ConfettiView.swift
│   │   ├── EmptyStateView.swift
│   │   ├── ErrorRetryView.swift
│   │   └── AvatarView.swift
│   └── Resources/
│       ├── Assets.xcassets
│       ├── Localizable.xcstrings
│       └── Info.plist
│
├── RecompWatch/                            # watchOS app target
│   ├── App/
│   │   └── RecompWatchApp.swift
│   ├── Features/
│   │   ├── DashboardWatch/
│   │   ├── QuickMealLog/
│   │   ├── WorkoutWatch/
│   │   ├── HydrationWatch/
│   │   ├── FastingWatch/
│   │   ├── BiofeedbackWatch/
│   │   └── CoachWatch/
│   ├── Complications/
│   │   └── ComplicationProvider.swift
│   └── Resources/
│       └── Assets.xcassets
│
├── RecompKit/                              # Shared Swift package
│   ├── Package.swift
│   └── Sources/
│       ├── Models/
│       │   ├── UserProfile.swift
│       │   ├── Macros.swift
│       │   ├── MealEntry.swift
│       │   ├── FitnessPlan.swift
│       │   ├── WorkoutDay.swift
│       │   ├── DietDay.swift
│       │   ├── Milestone.swift
│       │   ├── WearableData.swift
│       │   ├── Group.swift
│       │   ├── Challenge.swift
│       │   ├── HydrationEntry.swift
│       │   ├── FastingSession.swift
│       │   ├── BiofeedbackEntry.swift
│       │   ├── MetabolicModel.swift
│       │   ├── Supplement.swift
│       │   ├── BloodWork.swift
│       │   ├── BodyScan.swift
│       │   ├── CoachMessage.swift
│       │   ├── ActivityLogEntry.swift
│       │   └── SocialSettings.swift
│       ├── Networking/
│       │   ├── APIClient.swift
│       │   ├── APIRouter.swift
│       │   ├── Endpoints/
│       │   │   ├── AuthEndpoints.swift
│       │   │   ├── MealEndpoints.swift
│       │   │   ├── PlanEndpoints.swift
│       │   │   ├── WorkoutEndpoints.swift
│       │   │   ├── GroupEndpoints.swift
│       │   │   ├── WearableEndpoints.swift
│       │   │   ├── CoachEndpoints.swift
│       │   │   ├── ActEndpoints.swift
│       │   │   ├── VoiceEndpoints.swift
│       │   │   ├── SocialEndpoints.swift
│       │   │   ├── ResearchEndpoints.swift
│       │   │   └── PushEndpoints.swift
│       │   └── StreamingClient.swift       # NDJSON streaming for voice
│       ├── Services/
│       │   ├── AuthService.swift
│       │   ├── MealService.swift
│       │   ├── PlanService.swift
│       │   ├── WorkoutService.swift
│       │   ├── GroupService.swift
│       │   ├── CoachService.swift
│       │   ├── WearableService.swift
│       │   ├── SyncService.swift
│       │   ├── PushNotificationService.swift
│       │   ├── VoiceService.swift
│       │   ├── ImageAnalysisService.swift
│       │   ├── ResearchService.swift
│       │   └── NutritionLookupService.swift
│       ├── Persistence/
│       │   ├── SwiftDataContainer.swift
│       │   ├── SyncEngine.swift
│       │   └── MigrationPlan.swift
│       └── Utilities/
│           ├── MacroCalculator.swift
│           ├── DateHelpers.swift
│           ├── ImageResizer.swift
│           └── FoodQuantityParser.swift
│
├── RecompWidgets/                          # iOS widgets (optional future)
│   └── ...
│
└── RecompTests/
    ├── Unit/
    └── UI/
```

---

## 3. Data Layer

### 3.1 SwiftData Models

All models are defined in `RecompKit/Sources/Models/` and decorated with `@Model` for SwiftData persistence. They map 1:1 to the web app's TypeScript types.

```swift
// Example core models (simplified)

@Model
final class UserProfile {
    @Attribute(.unique) var id: String
    var name: String
    var email: String?
    var age: Int
    var weight: Double
    var height: Double
    var gender: Gender
    var fitnessLevel: FitnessLevel
    var goal: FitnessGoal
    var activityLevel: ActivityLevel
    var unitSystem: UnitSystem
    var workoutLocation: WorkoutLocation
    var equipment: [String]
    var workoutDaysPerWeek: Int
    var timeframeWeeks: Int
    var dietaryRestrictions: [String]
    var avatarData: Data?
    var createdAt: Date
    var lastSyncedAt: Date?
}

@Model
final class MealEntry {
    @Attribute(.unique) var id: String
    var date: String              // "YYYY-MM-DD"
    var mealType: MealType        // breakfast, lunch, dinner, snack
    var name: String
    var calories: Int
    var protein: Double
    var carbs: Double
    var fat: Double
    var notes: String?
    var imageData: Data?
    var createdAt: Date
    var synced: Bool
}

@Model
final class FitnessPlan {
    @Attribute(.unique) var id: String
    var dietPlan: [DietDay]       // Codable stored as JSON
    var workoutPlan: [WorkoutDay] // Codable stored as JSON
    var generatedAt: Date
    var synced: Bool
}
```

### 3.2 Full Model Inventory

Every TypeScript type from `src/lib/types.ts` gets a Swift equivalent:

| Web Type | Swift Model | SwiftData `@Model`? | Notes |
|----------|------------|---------------------|-------|
| `UserProfile` | `UserProfile` | Yes | Primary user entity |
| `Macros` | `Macros` | No (embedded `Codable`) | Reused in meals, plans, targets |
| `MealEntry` | `MealEntry` | Yes | Per-meal records |
| `FitnessPlan` | `FitnessPlan` | Yes | Contains diet + workout JSON |
| `WorkoutDay` / `WorkoutExercise` | `WorkoutDay` / `WorkoutExercise` | No (Codable) | Embedded in plan |
| `DietDay` | `DietDay` | No (Codable) | Embedded in plan |
| `Milestone` | `Milestone` | Yes | Badges, achievements |
| `WearableConnection` | `WearableConnection` | Yes | Provider connections |
| `WearableDaySummary` | `WearableDaySummary` | Yes | Daily wearable data |
| `Group` | `Group` | Yes | Group metadata |
| `GroupMembership` | `GroupMembership` | Yes | User ↔ group relation |
| `GroupMessage` | `GroupMessage` | Yes | Chat messages |
| `GroupMemberProgress` | `GroupMemberProgress` | No (Codable) | Leaderboard data |
| `HydrationEntry` | `HydrationEntry` | Yes | Water intake |
| `FastingSession` | `FastingSession` | Yes | Fasting windows |
| `BiofeedbackEntry` | `BiofeedbackEntry` | Yes | Mood/energy/stress |
| `MetabolicModel` | `MetabolicModel` | Yes | TDEE estimates |
| `PantryItem` | `PantryItem` | Yes | Kitchen inventory |
| `Supplement` | `Supplement` | Yes | Supplement stack |
| `BloodWork` | `BloodWork` | Yes | Lab results |
| `BodyScan` | `BodyScan` | Yes | Progress photos |
| `RicoMessage` | `CoachMessage` | Yes | AI coach conversation |
| `WeeklyReview` | `WeeklyReview` | Yes | Multi-agent review |
| `ActivityLogEntry` | `ActivityLogEntry` | Yes | Workout/walk/etc. |
| `RecoveryAssessment` | `RecoveryAssessment` | No (Codable) | Recovery scoring |
| `MealPrepPlan` | `MealPrepPlan` | Yes | Weekly meal prep |
| `Challenge` | `Challenge` | Yes | Group challenges |
| `PublicProfile` | `PublicProfile` | No (Codable) | API response type |
| `CookingAppConnection` | `CookingAppConnection` | Yes | Third-party link |
| `MusicPreference` | `MusicPreference` | No (Codable) | Workout music |
| `SocialSettings` | `SocialSettings` | Yes | Visibility, username |

### 3.3 Enums

```swift
enum Gender: String, Codable, CaseIterable { case male, female, other }
enum FitnessLevel: String, Codable, CaseIterable { case beginner, intermediate, advanced }
enum FitnessGoal: String, Codable, CaseIterable { case loseWeight, buildMuscle, recomp, maintain }
enum ActivityLevel: String, Codable, CaseIterable { case sedentary, light, moderate, active, veryActive }
enum UnitSystem: String, Codable { case imperial, metric }
enum WorkoutLocation: String, Codable, CaseIterable { case gym, home, both }
enum MealType: String, Codable, CaseIterable { case breakfast, lunch, dinner, snack }
enum WearableProvider: String, Codable { case oura, fitbit, apple, garmin, android, scale }
enum Visibility: String, Codable { case badgesOnly, badgesStats, fullTransparency }
enum CoachPersona: String, Codable { case `default`, motivator, scientist, toughLove, chillFriend }
enum GroupAccessMode: String, Codable { case open, invite }
enum GroupTrackingMode: String, Codable { case aggregate, leaderboard, both }
```

---

## 4. Networking & API

### 4.1 API Client

A single `APIClient` actor manages all HTTP communication with the existing Next.js backend. The iOS app consumes the same `/api/*` routes the web app uses.

```swift
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let baseURL: URL
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T
    func upload<T: Decodable>(_ endpoint: APIEndpoint, imageData: Data) async throws -> T
    func stream(_ endpoint: APIEndpoint) -> AsyncThrowingStream<Data, Error>
}
```

### 4.2 Endpoint Mapping (Web → Swift)

Every API route from the web app maps to a typed Swift endpoint:

| Domain | Web Route | Swift Endpoint | Method |
|--------|-----------|----------------|--------|
| **Auth** | `/api/auth/register` | `.authRegister(SignUpPayload)` | POST |
| | `/api/auth/login` | `.authLogin(email, password)` | POST |
| | `/api/auth/me` | `.authMe` | GET |
| | `/api/auth/demo` | `.authDemo` | POST |
| | `/api/auth/claim` | `.authClaim(email, password)` | POST |
| **Sync** | `/api/data/sync` | `.dataSync(SyncPayload)` | POST |
| | `/api/data/sync` | `.dataFetch` | GET |
| **Plans** | `/api/plans/generate` | `.planGenerate(profile)` | POST |
| | `/api/plans/adjust` | `.planAdjust(feedback, currentPlan)` | POST |
| **Meals** | `/api/meals/suggest` | `.mealSuggest(profile, plan, date)` | POST |
| | `/api/meals/analyze-photo` | `.mealAnalyzePhoto(imageData)` | POST |
| | `/api/meals/analyze-receipt` | `.mealAnalyzeReceipt(imageData)` | POST |
| | `/api/meals/analyze-menu` | `.mealAnalyzeMenu(imageData)` | POST |
| | `/api/meals/lookup-nutrition-web` | `.mealLookupNutrition(query)` | POST |
| | `/api/meals/parse-recipe-url` | `.mealParseRecipe(url)` | POST |
| | `/api/meals/smart-suggest` | `.mealSmartSuggest(...)` | POST |
| | `/api/meals/generate-plan` | `.mealGeneratePlan(...)` | POST |
| **Voice** | `/api/voice/sonic/stream` | `.voiceSonicStream(audioData)` | POST (streaming) |
| | `/api/voice/parse` | `.voiceParse(text)` | POST |
| **Coach** | `/api/rico` | `.coachChat(message, history)` | POST |
| **Agent** | `/api/agent/weekly-review` | `.weeklyReview(payload)` | POST |
| **Images** | `/api/images/generate` | `.imageGenerate(prompt)` | POST |
| **Video** | `/api/video/generate` | `.videoGenerate(scans)` | POST |
| **Act** | `/api/act/grocery` | `.actGrocery(items)` | POST |
| | `/api/act/nutrition` | `.actNutrition(food)` | POST |
| **Exercises** | `/api/exercises/search` | `.exerciseSearch(name)` | GET |
| | `/api/exercises/gif` | `.exerciseGif(id)` | GET |
| **Research** | `/api/research` | `.research(query)` | GET |
| **Wearables** | `/api/wearables/oura/connect` | `.ouraConnect(token)` | POST |
| | `/api/wearables/oura/data` | `.ouraData` | GET |
| | `/api/wearables/fitbit/auth` | `.fitbitAuth` | GET |
| | `/api/wearables/fitbit/data` | `.fitbitData` | GET |
| | `/api/wearables/apple/healthkit` | `.appleHealthSync(data)` | POST |
| | `/api/wearables/health/import` | `.healthImport(data)` | POST |
| | `/api/wearables/scale/entry` | `.scaleEntry(data)` | POST |
| **Groups** | `/api/groups` | `.groupsList` / `.groupCreate(payload)` | GET / POST |
| | `/api/groups/discover` | `.groupsDiscover` | GET |
| | `/api/groups/join-by-code` | `.groupJoinByCode(code)` | POST |
| | `/api/groups/[id]` | `.groupDetail(id)` | GET |
| | `/api/groups/[id]/messages` | `.groupMessages(id)` / `.groupSendMessage(id, text)` | GET / POST |
| | `/api/groups/[id]/progress` | `.groupProgress(id)` | GET / POST |
| **Challenges** | `/api/challenges` | `.challengesList` | GET |
| | `/api/challenges/create` | `.challengeCreate(payload)` | POST |
| | `/api/challenges/join` | `.challengeJoin(id)` | POST |
| | `/api/challenges/progress` | `.challengeProgress(id)` | POST |
| **Social** | `/api/social/settings` | `.socialSettings` / `.socialSettingsUpdate(payload)` | GET / PUT |
| | `/api/social/username/check` | `.usernameCheck(username)` | GET |
| | `/api/social/profile/[id]` | `.publicProfile(id)` | GET |
| **Push** | `/api/push/subscribe-expo` | `.pushSubscribeExpo(token)` | POST |
| | `/api/push/unsubscribe-expo` | `.pushUnsubscribeExpo(token)` | POST |
| **Calendar** | `/api/calendar/token` | `.calendarToken` | POST |
| | `/api/calendar/feed` | `.calendarFeed(token)` | GET |
| **Cooking** | `/api/cooking/connect` | `.cookingConnect(provider)` | POST |
| | `/api/cooking/import` | `.cookingImport(data)` | POST |
| **Other** | `/api/metabolic/update` | `.metabolicUpdate(payload)` | POST |
| | `/api/biofeedback/insights` | `.biofeedbackInsights(entries)` | POST |
| | `/api/bloodwork/parse` | `.bloodworkParse(imageData)` | POST |
| | `/api/body-scan/progress-reel` | `.bodyScanProgressReel(scans)` | POST |
| | `/api/music/suggest` | `.musicSuggest(mood, genre)` | POST |
| | `/api/workouts/recovery-adjust` | `.workoutRecoveryAdjust(...)` | POST |
| | `/api/supplements/analyze` | `.supplementsAnalyze(list)` | POST |
| | `/api/coach/check-in` | `.coachCheckIn` | POST |
| | `/api/macros/calculate` | `.macrosCalculate(profile)` | POST |
| | `/api/meal-prep/generate` | `.mealPrepGenerate(...)` | POST |
| | `/api/meal-prep/grocery-list` | `.mealPrepGroceryList(plan)` | POST |
| | `/api/feedback` | `.feedbackSubmit(rating, text)` | POST |
| | `/api/onboarding/voice-extract` | `.onboardingVoiceExtract(text)` | POST |

### 4.3 Streaming

Voice features (Nova Sonic) use NDJSON streaming. The Swift app uses `URLSession.bytes(for:)` to process the stream line-by-line:

```swift
func streamVoice(_ audioChunks: AsyncStream<Data>) -> AsyncThrowingStream<VoiceResponse, Error> {
    // POST audio chunks, read NDJSON response lines
}
```

---

## 5. Authentication

### 5.1 Strategy

The web app uses a `recomp_uid` cookie. The iOS app will:

1. **Store the auth cookie** in the shared `HTTPCookieStorage` so `URLSession` sends it automatically.
2. **Also** persist the `userId` in the Keychain (via `KeychainService`) for offline access and Watch connectivity.
3. On launch, call `/api/auth/me` to validate the session.

```swift
final class AuthService {
    @Published private(set) var currentUser: UserProfile?
    @Published private(set) var isAuthenticated: Bool = false

    func register(_ payload: SignUpPayload) async throws -> UserProfile
    func login(email: String, password: String) async throws -> UserProfile
    func loadDemo() async throws -> UserProfile
    func claimAccount(email: String, password: String) async throws
    func checkSession() async throws -> UserProfile?
    func logout()
}
```

### 5.2 Keychain

```swift
struct KeychainService {
    static func save(userId: String) throws
    static func loadUserId() throws -> String?
    static func delete() throws
}
```

---

## 6. Feature Modules

### 6.1 Onboarding

| Web Feature | Swift Implementation |
|-------------|---------------------|
| Sign-up form (name, age, weight, etc.) | Multi-step `Form` with `Stepper`, `Picker`, `TextField` |
| Voice onboarding (Nova Sonic) | `AVAudioRecorder` → stream to `/api/voice/sonic/stream` → parse profile JSON |
| Demo mode | One-tap demo button, calls `/api/auth/demo` |
| Login | Email/password `SecureField` |

### 6.2 Dashboard

Maps to `Dashboard.tsx`. All widgets become SwiftUI sub-views:

| Widget | Swift Component | Notes |
|--------|-----------------|-------|
| Calorie budget bar | `CalorieBudgetCard` | `ProgressView` with gradient |
| Macro pills | `MacroPillsView` | Horizontal stack of capsule badges |
| Activity log | `ActivityLogCard` | Add/remove activity, sedentary time |
| Today's workout / diet | Compact `WorkoutDayCard` + `DietDayCard` | Tap to navigate |
| Weekly calendar | `WeeklyCalendarStrip` | Horizontal `ScrollView` with date selection |
| Exercise demos | `ExerciseDemoView` | Async GIF loading from ExerciseDB |
| Weekly AI review | `WeeklyReviewCard` | Generate button → multi-agent API |
| Daily quests | `DailyQuestsCard` | List of today's goals |
| Duel card | `DuelCard` | 1v1 challenge info |
| Hydration | `HydrationWidget` | Quick-add buttons (250ml, 500ml, custom) |
| Fasting | `FastingWidget` | Timer with `TimelineView`, start/stop |
| Biofeedback | `BiofeedbackCard` | 5-point slider for energy/mood/hunger/stress/soreness |
| Metabolic model | `MetabolicModelCard` | TDEE display with trend chart |
| Coach check-in | `CoachCheckInCard` | Prompts from coach |
| Research | `ResearchView` | Search field → web-grounded results |
| Shopping list | `ShoppingListView` | Plan-derived list + grocery search |
| Avatar | `AvatarView` | `PhotosPicker` for profile picture |

### 6.3 Meals

| Web Feature | Swift Implementation |
|-------------|---------------------|
| Date selector with dots | `CalendarStripView` with meal indicators |
| Text meal entry | `AddMealSheet` with `TextField` + `Stepper` for macros |
| AI meal suggestions | Button → `/api/meals/suggest` |
| Voice logging | `VoiceMealLogger` using `AVAudioEngine` → `/api/voice/sonic/stream` |
| Photo analysis | `PhotoMealAnalyzer` — `CameraView` (UIKit bridge) + `PhotosPicker` → `/api/meals/analyze-photo` |
| Receipt scan | `ReceiptScanner` — camera → `/api/meals/analyze-receipt` |
| Menu scan | `MenuScanner` — camera → `/api/meals/analyze-menu` |
| Auto-fill nutrition | `/api/act/nutrition` or `/api/meals/lookup-nutrition-web` |
| Recipe URL import | `RecipeURLImporter` — paste URL → `/api/meals/parse-recipe-url` |
| Similar meals | `SimilarMealsView` — embeddings-based one-tap re-log |
| Inspiration images | `MealInspirationView` — `/api/images/generate` (Nova Canvas) |
| Cooking app import | `CookingAppImportView` — CSV/JSON import via `/api/cooking/import` |
| Pantry | `PantryView` — CRUD for pantry items |
| Meal prep | `MealPrepView` — generate + grocery list |
| Meal list (edit/delete) | `List` with swipe-to-delete, edit sheet |

### 6.4 Workouts

| Web Feature | Swift Implementation |
|-------------|---------------------|
| Calendar date picker | `CalendarStripView` with workout indicators |
| Weekly plan cards | `List` of expandable `WorkoutDayCard` (warmups, main, finishers) |
| Exercise demos | `ExerciseDemoView` — async image/GIF from ExerciseDB |
| Progress tracking | `SetTrackerView` — mark sets/reps with `Toggle` / `Stepper` |
| Edit mode | `WorkoutEditView` — rename days, change focus, add/remove exercises |

### 6.5 Adjust

| Web Feature | Swift Implementation |
|-------------|---------------------|
| Feedback text area | `TextEditor` for free-form input |
| Add latest guidelines | Button → `/api/research` to prefill |
| Adjust button | Submit → `/api/plans/adjust` |
| Apply results | Preview new macros → confirm to apply |

### 6.6 Progress (Milestones)

| Web Feature | Swift Implementation |
|-------------|---------------------|
| Badges grid | `LazyVGrid` of badge icons with progress rings |
| XP / level | XP bar with level indicator |
| Measurement targets | Editable target weight, body fat, muscle mass |
| Smart scale entry | Form: weight, body fat %, muscle mass, BMI, etc. |
| Wearable data table | Tabular view of historical data with `Charts` framework |
| Progress photos | `ProgressPhotosView` — camera capture front/side/back |
| Progress reel | `ProgressReelView` — generate via `/api/body-scan/progress-reel`, play with `AVPlayer` |
| Weekly recap | `WeeklyRecapCard` — shareable card (render to image via `ImageRenderer`) |
| Biofeedback insights | `BiofeedbackInsightsView` — AI correlations from `/api/biofeedback/insights` |

### 6.7 Groups

| Web Feature | Swift Implementation |
|-------------|---------------------|
| My groups | `List` of group cards |
| Discover | Browse open groups from `/api/groups/discover` |
| Challenges tab | List of active challenges |
| Group detail — chat | `GroupChatView` — messages with pin/unpin, send |
| Group detail — activity | `GroupActivityView` — leaderboard by XP/streak/macro |
| Members | `GroupMembersView` — member list |
| Group challenges | `GroupChallengesView` — create/join challenges |
| Create group | `CreateGroupSheet` — name, description, goal, access, tracking |
| Invite | `InviteCodeView` — copy code, share sheet |

### 6.8 Profile

| Web Feature | Swift Implementation |
|-------------|---------------------|
| Profile form | `Form` with all profile fields |
| Wearable connections | `WearableConnectionsView` — native HealthKit + Oura/Fitbit OAuth via `ASWebAuthenticationSession` |
| Calendar feed | `CalendarFeedView` — generate token, add to Apple Calendar |
| Social settings | `SocialSettingsView` — visibility picker, username |
| Push notifications | `PushNotificationSettings` — native APNs toggle |
| Coach schedule | `CoachScheduleView` — check-in time pickers |
| Supplements | `SupplementsView` — CRUD list |
| Blood work | `BloodWorkView` — camera/photo upload → `/api/bloodwork/parse` |
| Claim account | `ClaimAccountView` — email + password form |

### 6.9 Coach (Rico AI Chat)

| Web Feature | Swift Implementation |
|-------------|---------------------|
| Floating chat button | Persistent overlay button (`.overlay` modifier on tab container) |
| Text chat | `CoachChatView` — message bubbles, text input |
| Voice chat | `CoachVoiceSession` — `AVAudioEngine` recording → `/api/voice/sonic/stream` |
| Coach persona selection | Picker in settings (default, motivator, scientist, tough_love, chill_friend) |

### 6.10 Public Profile

Deep-linkable view (`recomp://profile/{username}`) showing badges, stats, and recent meals based on visibility settings. Uses `/api/social/profile/{id}`.

---

## 7. Apple Watch App

### 7.1 Design Philosophy

The Watch app is a **companion** focused on glanceable data and quick input. It does NOT replicate every screen. It focuses on the features most useful on the wrist.

### 7.2 Watch Features

| Feature | Watch View | Description |
|---------|-----------|-------------|
| **Dashboard glance** | `WatchDashboardView` | Today's calorie budget remaining, macro progress rings, streak count |
| **Quick meal log** | `QuickMealLogView` | Voice dictation (native `SFSpeechRecognizer`) or pick from recent meals (last 10) to one-tap log |
| **Active workout** | `WatchWorkoutView` | Current workout day's exercises, tap to mark sets complete; auto-start `HKWorkoutSession` for calorie tracking |
| **Hydration** | `WatchHydrationView` | Quick-add water buttons (250ml, 500ml); today's total |
| **Fasting timer** | `WatchFastingView` | Current fasting state, start/stop, countdown timer via `TimelineView` |
| **Biofeedback** | `WatchBiofeedbackView` | Quick 1–5 entry for energy, mood, hunger, stress, soreness using `DigitalCrownRotationalBehavior` |
| **Coach nudge** | `WatchCoachView` | Display latest coach check-in prompt; quick reply with dictation |
| **Notifications** | Push notifications | APNs rich notifications — actionable (e.g., "Log this meal", "Start workout") |

### 7.3 Watch Complications

Using `WidgetKit` for watchOS (timeline-based complications):

| Complication Family | Content |
|---------------------|---------|
| `accessoryCircular` | Calorie budget remaining ring |
| `accessoryRectangular` | Macro progress bars (P / C / F) |
| `accessoryInline` | "1,847 cal left · 🔥 12-day streak" |
| `accessoryCorner` | Calorie ring with number |

### 7.4 Watch ↔ iPhone Communication

```
┌─────────────┐     WatchConnectivity      ┌─────────────┐
│  Watch App   │◄──────────────────────────►│   iOS App    │
│              │   .transferUserInfo()       │              │
│  SwiftData   │   .sendMessage()           │  SwiftData   │
│  (local)     │   .transferFile()          │  (primary)   │
└─────────────┘                             └──────┬───────┘
                                                   │
                                              URLSession
                                                   │
                                            ┌──────▼───────┐
                                            │  Recomp API  │
                                            │  (Next.js)   │
                                            └──────────────┘
```

**Communication strategy:**

| Direction | Mechanism | Data |
|-----------|-----------|------|
| iPhone → Watch | `transferCurrentComplicationUserInfo()` | Latest calorie/macro state for complications |
| iPhone → Watch | `updateApplicationContext()` | Today's plan, recent meals, fasting state |
| Watch → iPhone | `sendMessage()` (reachable) | Quick meal log, hydration, biofeedback entries |
| Watch → iPhone | `transferUserInfo()` (background) | Same, queued when iPhone unreachable |
| Watch standalone | Direct API via `URLSession` on Watch | Fallback when iPhone is not reachable |

### 7.5 Watch HealthKit Integration

```swift
class WatchWorkoutManager: NSObject, ObservableObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    func startWorkout(type: HKWorkoutActivityType)
    func endWorkout()
    // Auto-log calories burned to Recomp after workout ends
}
```

The Watch app can start `HKWorkoutSession` for workouts listed in the plan. After ending, it:
1. Saves the workout to HealthKit
2. Sends calories burned to the iPhone app via `WatchConnectivity`
3. iPhone syncs the activity log entry to the Recomp API

---

## 8. Native Platform Integrations

### 8.1 HealthKit (replaces web HealthKit bridge)

The web app has an HealthKit bridge (`apple-health-bridge.ts`). The Swift app integrates **natively**:

```swift
actor HealthKitService {
    func requestAuthorization() async throws

    // Read
    func readTodaySteps() async throws -> Int
    func readTodayActiveCalories() async throws -> Double
    func readLatestWeight() async throws -> Double?
    func readLatestBodyFat() async throws -> Double?
    func readSleepAnalysis(for date: Date) async throws -> TimeInterval
    func readHeartRateSamples(for date: Date) async throws -> [Double]
    func readRestingHeartRate() async throws -> Double?

    // Write
    func saveWeight(_ kg: Double, date: Date) async throws
    func saveBodyFatPercentage(_ pct: Double, date: Date) async throws
    func saveDietaryEnergy(_ calories: Double, date: Date) async throws
    func saveWaterIntake(_ ml: Double, date: Date) async throws

    // Background delivery
    func enableBackgroundDelivery() async throws
    // Observes weight, steps, workouts and syncs to Recomp
}
```

**HealthKit data types requested:**

| Category | Types |
|----------|-------|
| Body | `bodyMass`, `bodyFatPercentage`, `leanBodyMass`, `bmi`, `height` |
| Activity | `stepCount`, `activeEnergyBurned`, `basalEnergyBurned`, `appleExerciseTime` |
| Heart | `heartRate`, `restingHeartRate`, `heartRateVariabilitySDNN` |
| Sleep | `sleepAnalysis` |
| Nutrition | `dietaryEnergyConsumed`, `dietaryProtein`, `dietaryCarbohydrates`, `dietaryFatTotal`, `dietaryWater` |
| Workout | `workoutType` |

### 8.2 Camera

Used for: meal photos, receipt scanning, menu scanning, body scan photos, blood work images.

```swift
struct CameraView: UIViewControllerRepresentable {
    // Wraps UIImagePickerController or AVCaptureSession for custom camera UI
    @Binding var image: UIImage?
    var sourceType: UIImagePickerController.SourceType
}
```

Also integrates `PhotosPicker` (SwiftUI native) for library selection.

### 8.3 Push Notifications (APNs)

Replaces web push (`web-push` / VAPID). Uses Expo push integration already in the backend (`/api/push/subscribe-expo`):

```swift
class PushNotificationService: NSObject, UNUserNotificationCenterDelegate {
    func registerForPushNotifications()
    func handleDeviceToken(_ token: Data)
    // Registers Expo push token with /api/push/subscribe-expo
    // Handles foreground/background/actionable notifications
}
```

**Actionable notification categories:**

| Category | Actions |
|----------|---------|
| `MEAL_REMINDER` | "Log Meal", "Snooze 30min" |
| `WORKOUT_REMINDER` | "Start Workout", "Skip Today" |
| `HYDRATION_REMINDER` | "Log Water", "Dismiss" |
| `COACH_CHECKIN` | "Reply", "Dismiss" |

### 8.4 Speech Recognition

For on-device voice input (complementing Nova Sonic for AI understanding):

```swift
class SpeechRecognitionService {
    func transcribe() -> AsyncStream<String>  // On-device SFSpeechRecognizer
}
```

### 8.5 Share Sheet & Deep Links

| Feature | Implementation |
|---------|----------------|
| Share weekly recap card | `ShareLink` with rendered `Image` |
| Share profile link | `ShareLink` with URL |
| Share invite code | `ShareLink` / `UIPasteboard` |
| Deep links | `recomp://` URL scheme + Universal Links for `recomp.app/u/{username}` |
| Spotlight indexing | `CSSearchableIndex` for meals, workouts, groups |

### 8.6 Widgets (Future Phase)

iOS home screen widgets via `WidgetKit`:

| Widget | Size | Content |
|--------|------|---------|
| Calorie tracker | Small | Ring + remaining calories |
| Macro dashboard | Medium | 3 macro bars + calorie ring |
| Today's plan | Large | Meals + workout summary |
| Streak | Small | Fire icon + streak count |

---

## 9. Offline-First & Sync

### 9.1 Strategy

Mirrors the web app's localStorage-first approach but with SwiftData:

```
┌────────────────┐
│   SwiftData    │  ← primary source of truth on device
│   (local DB)   │
└───────┬────────┘
        │  SyncEngine (debounced, background)
        ▼
┌────────────────┐
│  /api/data/sync│  ← bidirectional sync with DynamoDB
│  (POST / GET)  │
└────────────────┘
```

### 9.2 SyncEngine

```swift
actor SyncEngine {
    func scheduleSync()              // Debounced (800ms, matching web app)
    func syncNow() async throws      // Immediate full sync
    func markDirty(_ entity: any PersistentModel)

    // Background sync via BGAppRefreshTask
    func registerBackgroundTask()
    func performBackgroundSync() async
}
```

### 9.3 Conflict Resolution

Same as web app: **last-write-wins** with `lastModified` timestamps. The server's `/api/data/sync` endpoint handles merging.

### 9.4 Offline Capabilities

All features work offline except:
- AI-powered features (meal suggestions, plan generation, coach chat, voice AI, image generation)
- Group chat (messages queue locally and send when online)
- Wearable OAuth flows

Offline-queued actions sync automatically when connectivity returns.

---

## 10. Dependencies

### Swift Package Manager

| Package | Purpose |
|---------|---------|
| **KeychainAccess** | Secure credential storage |
| **Nuke** | Async image loading + caching (exercise GIFs, avatars) |
| **SwiftUI-Introspect** | UIKit bridge for advanced customizations |
| **Charts** (Apple) | Built-in — macro trends, weight graphs, metabolic charts |
| **HealthKit** (Apple) | Built-in — wearable data, workouts |
| **WatchConnectivity** (Apple) | Built-in — Watch ↔ iPhone sync |
| **WidgetKit** (Apple) | Built-in — complications + widgets |
| **AVFoundation** (Apple) | Built-in — camera, audio recording |
| **Speech** (Apple) | Built-in — on-device speech recognition |
| **AuthenticationServices** (Apple) | Built-in — `ASWebAuthenticationSession` for OAuth (Fitbit, Oura) |

### No External Networking Library

`URLSession` with `async/await` is sufficient. No Alamofire needed.

---

## 11. Build & Distribution

### 11.1 Targets

| Target | Bundle ID | Platform |
|--------|-----------|----------|
| `RecompApp` | `com.recomp.ios` | iOS |
| `RecompWatch` | `com.recomp.ios.watchkitapp` | watchOS |
| `RecompKit` | (SPM library) | iOS + watchOS |
| `RecompWidgets` | `com.recomp.ios.widgets` | iOS + watchOS |
| `RecompTests` | `com.recomp.ios.tests` | iOS |

### 11.2 CI/CD

| Stage | Tool |
|-------|------|
| Build & test | Xcode Cloud or GitHub Actions (`xcodebuild`) |
| Linting | SwiftLint |
| Distribution | TestFlight → App Store |

### 11.3 Environment Configuration

```swift
enum Environment {
    case development
    case staging
    case production

    var apiBaseURL: URL { ... }
}
```

API base URL configured via Xcode scheme environment variables or `.xcconfig` files.

---

## 12. Migration & Rollout Phases

### Phase 1: Foundation (Weeks 1–3)

- [ ] Xcode project setup with iOS + watchOS targets + `RecompKit` package
- [ ] SwiftData models for all entities
- [ ] `APIClient` with auth endpoints
- [ ] `AuthService` (register, login, demo, session check)
- [ ] `SyncEngine` basic implementation
- [ ] Onboarding flow (sign-up form, login, demo)
- [ ] Tab bar shell with empty views
- [ ] Keychain storage

### Phase 2: Core Features (Weeks 4–7)

- [ ] Dashboard view with all widgets
- [ ] Meals view — text entry, date selector, meal list
- [ ] Meals — photo analysis (camera + `PhotosPicker`)
- [ ] Meals — AI suggestions
- [ ] Meals — receipt & menu scanning
- [ ] Workouts view — plan display, set tracking
- [ ] Exercise demo GIF loading
- [ ] Adjust view — feedback + AI adjustment
- [ ] HealthKit integration (read + write + background delivery)

### Phase 3: AI & Voice (Weeks 8–9)

- [ ] Nova Sonic voice streaming (meal logging, onboarding, coach)
- [ ] Coach (Rico) chat — text + voice
- [ ] Weekly AI review (multi-agent)
- [ ] Meal inspiration images (Nova Canvas)
- [ ] Research view (web grounding)
- [ ] Recipe URL import
- [ ] Nutrition lookup (Act + web grounding)

### Phase 4: Progress & Social (Weeks 10–12)

- [ ] Progress view — badges, XP, measurements
- [ ] Progress photos with camera capture
- [ ] Progress reel video generation + playback
- [ ] Weekly recap card (shareable)
- [ ] Biofeedback insights
- [ ] Groups — list, discover, create, join
- [ ] Group detail — chat, activity, leaderboard
- [ ] Challenges — create, join, progress
- [ ] Public profile + deep links

### Phase 5: Profile & Integrations (Weeks 13–14)

- [ ] Profile view — all settings
- [ ] Wearable connections (Oura, Fitbit via OAuth; native HealthKit)
- [ ] Calendar feed integration
- [ ] Social settings + username
- [ ] Push notifications (APNs + Expo)
- [ ] Supplements, blood work, coaching schedule
- [ ] Cooking app import
- [ ] Pantry, meal prep
- [ ] Grocery search + shopping list
- [ ] Hydration tracking
- [ ] Fasting timer
- [ ] Metabolic model
- [ ] Smart scale entry

### Phase 6: Apple Watch (Weeks 15–17)

- [ ] Watch app shell + WatchConnectivity setup
- [ ] Watch dashboard glance (calories, macros, streak)
- [ ] Watch quick meal log (dictation + recent meals)
- [ ] Watch workout tracking (`HKWorkoutSession`)
- [ ] Watch hydration quick-add
- [ ] Watch fasting timer
- [ ] Watch biofeedback entry
- [ ] Watch coach nudge display
- [ ] Complications (calorie ring, macros, streak)
- [ ] Actionable push notifications on Watch

### Phase 7: Polish & Launch (Weeks 18–20)

- [ ] Offline resilience testing
- [ ] Accessibility audit (VoiceOver, Dynamic Type, color contrast)
- [ ] Dark mode / light mode theming
- [ ] Haptic feedback for interactions
- [ ] Animation polish (transitions, micro-interactions)
- [ ] Localization setup
- [ ] Performance profiling (Instruments)
- [ ] App Store assets (screenshots, preview video, description)
- [ ] TestFlight beta
- [ ] App Store submission

---

## Appendix A: Screen-by-Screen Parity Checklist

| # | Web Screen / Feature | iOS View | Watch View | Status |
|---|---------------------|----------|------------|--------|
| 1 | Landing / Onboarding | `OnboardingView` | — | — |
| 2 | Voice Onboarding | `VoiceOnboardingView` | — | — |
| 3 | Dashboard | `DashboardView` | `WatchDashboardView` | — |
| 4 | Calorie Budget | `CalorieBudgetCard` | Complication | — |
| 5 | Macro Pills | `MacroPillsView` | Complication | — |
| 6 | Activity Log | `ActivityLogCard` | — | — |
| 7 | Today's Workout | `WorkoutDayCard` | `WatchWorkoutView` | — |
| 8 | Today's Diet | `DietDayCard` | — | — |
| 9 | Weekly Calendar | `WeeklyCalendarStrip` | — | — |
| 10 | Exercise Demos | `ExerciseDemoView` | — | — |
| 11 | Weekly AI Review | `WeeklyReviewCard` | — | — |
| 12 | Daily Quests | `DailyQuestsCard` | — | — |
| 13 | Duel Card | `DuelCard` | — | — |
| 14 | Hydration | `HydrationWidget` | `WatchHydrationView` | — |
| 15 | Fasting | `FastingWidget` | `WatchFastingView` | — |
| 16 | Biofeedback | `BiofeedbackCard` | `WatchBiofeedbackView` | — |
| 17 | Metabolic Model | `MetabolicModelCard` | — | — |
| 18 | Coach Check-in | `CoachCheckInCard` | `WatchCoachView` | — |
| 19 | Research | `ResearchView` | — | — |
| 20 | Shopping List | `ShoppingListView` | — | — |
| 21 | Grocery Search | `GrocerySearchView` | — | — |
| 22 | Meals — Date Selector | `CalendarStripView` | — | — |
| 23 | Meals — Text Entry | `AddMealSheet` | — | — |
| 24 | Meals — AI Suggest | `AddMealSheet` | — | — |
| 25 | Meals — Voice Log | `VoiceMealLogger` | `QuickMealLogView` | — |
| 26 | Meals — Photo | `PhotoMealAnalyzer` | — | — |
| 27 | Meals — Receipt | `ReceiptScanner` | — | — |
| 28 | Meals — Menu | `MenuScanner` | — | — |
| 29 | Meals — Nutrition Lookup | `AddMealSheet` | — | — |
| 30 | Meals — Recipe URL | `RecipeURLImporter` | — | — |
| 31 | Meals — Similar | `SimilarMealsView` | `QuickMealLogView` | — |
| 32 | Meals — Inspiration | `MealInspirationView` | — | — |
| 33 | Meals — Cooking Import | `CookingAppImportView` | — | — |
| 34 | Meals — Pantry | `PantryView` | — | — |
| 35 | Meals — Meal Prep | `MealPrepView` | — | — |
| 36 | Workouts — Plan | `WorkoutsView` | `WatchWorkoutView` | — |
| 37 | Workouts — Set Tracking | `SetTrackerView` | `WatchWorkoutView` | — |
| 38 | Workouts — Edit | `WorkoutEditView` | — | — |
| 39 | Adjust — Feedback | `AdjustView` | — | — |
| 40 | Adjust — Apply | `AdjustView` | — | — |
| 41 | Progress — Badges | `BadgesGrid` | — | — |
| 42 | Progress — XP/Level | `XPLevelView` | — | — |
| 43 | Progress — Measurements | `MeasurementsView` | — | — |
| 44 | Progress — Scale Entry | `SmartScaleEntryView` | — | — |
| 45 | Progress — Wearable Data | `WearableDataTable` | — | — |
| 46 | Progress — Photos | `ProgressPhotosView` | — | — |
| 47 | Progress — Reel | `ProgressReelView` | — | — |
| 48 | Progress — Recap | `WeeklyRecapCard` | — | — |
| 49 | Progress — Bio Insights | `BiofeedbackInsightsView` | — | — |
| 50 | Groups — My Groups | `GroupsView` | — | — |
| 51 | Groups — Discover | `GroupsView` | — | — |
| 52 | Groups — Challenges | `GroupsView` | — | — |
| 53 | Groups — Chat | `GroupChatView` | — | — |
| 54 | Groups — Activity | `GroupActivityView` | — | — |
| 55 | Groups — Members | `GroupMembersView` | — | — |
| 56 | Groups — Create | `CreateGroupSheet` | — | — |
| 57 | Groups — Invite | `InviteCodeView` | — | — |
| 58 | Profile — Form | `ProfileView` | — | — |
| 59 | Profile — Wearables | `WearableConnectionsView` | — | — |
| 60 | Profile — Calendar | `CalendarFeedView` | — | — |
| 61 | Profile — Social | `SocialSettingsView` | — | — |
| 62 | Profile — Push | `PushNotificationSettings` | — | — |
| 63 | Profile — Coach Schedule | `CoachScheduleView` | — | — |
| 64 | Profile — Supplements | `SupplementsView` | — | — |
| 65 | Profile — Blood Work | `BloodWorkView` | — | — |
| 66 | Profile — Claim Account | `ClaimAccountView` | — | — |
| 67 | Coach — Text Chat | `CoachChatView` | — | — |
| 68 | Coach — Voice Chat | `CoachVoiceSession` | — | — |
| 69 | Public Profile | `PublicProfileView` | — | — |
| 70 | Theme Toggle | System appearance setting | — | — |
| 71 | Feedback | `FeedbackButton` (sheet) | — | — |
| 72 | Offline Banner | Connectivity monitor | — | — |
| 73 | Music Suggest | Deep links to Spotify/Apple Music | — | — |
| 74 | Confetti | `ConfettiView` | — | — |

---

## Appendix B: Web → Native Upgrade Opportunities

Features that become *better* as native iOS/watchOS:

| Feature | Web Approach | Native Advantage |
|---------|-------------|------------------|
| HealthKit | HTTP bridge via API | Direct `HKHealthStore` — real-time, background delivery, no server round-trip |
| Camera | `<input type="file">` | `AVCaptureSession` — custom viewfinder, live preview, burst mode |
| Push notifications | Web Push (VAPID) | APNs — richer payloads, actionable buttons, background updates |
| Voice | MediaRecorder → upload | `AVAudioEngine` — lower latency, on-device preprocessing |
| Offline | localStorage | SwiftData — queryable, relational, larger capacity |
| Workout tracking | Manual logging | `HKWorkoutSession` — live heart rate, calorie tracking, auto-detect |
| Haptics | None | `UIImpactFeedbackGenerator` — tactile confirmations |
| Widgets | None | WidgetKit — home screen + Lock Screen glances |
| Complications | None | Watch face complications — always-visible data |
| Spotlight | None | `CSSearchableIndex` — system-wide search for meals, workouts |
| Shortcuts / Siri | None | `AppIntents` — "Hey Siri, log my lunch" |
| Background refresh | None | `BGAppRefreshTask` — periodic sync even when app is closed |
| Biometric auth | None | Face ID / Touch ID via `LAContext` |
