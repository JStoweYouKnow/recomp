# Recomp Android (Kotlin)

Native Android client library for Refactor, mirroring `RecompSwift/RefactorKit` scheduling and catch-up behavior.

## Modules

| Path | Purpose |
|------|---------|
| `RefactorKit/` | Shared models, `WorkoutScheduleService`, API DTOs, Compose UI |

## Catch-up / missed week (Phase 3)

- **Schedule state** on `WorkoutPlan`: `programWeekOffset`, `pausedUntil`, `missedSessions`, `advancementMode`
- **`WorkoutScheduleService`**: detect missed sessions, catch-up queue, apply schedule actions (same semantics as web)
- **`CatchUpBanner`**: Jetpack Compose UI wired to `/api/plans/adjust-schedule`
- **Sync**: schedule fields travel via existing `POST /api/data/sync` plan payload

## Usage

```kotlin
val progress: Map<String, String> = workoutProgressStore.load()
if (WorkoutScheduleService.shouldShowCatchUpBanner(plan, progress)) {
    CatchUpBanner(plan, progress, onApply = { updatedPlan -> planStore.save(updatedPlan) })
}
```

Integrate `RefactorKit` as a Gradle module in your Android app:

```kotlin
// settings.gradle.kts
include(":RefactorKit")

// app/build.gradle.kts
dependencies {
    implementation(project(":RefactorKit"))
}
```
