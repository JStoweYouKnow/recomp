import SwiftUI
import SwiftData
import RefactorKit

/// Today’s session from the shared SwiftData plan + `WorkoutService` progress (same keys as iOS `WorkoutsView`).
struct WatchWorkoutView: View {
    @Query(sort: \FitnessPlan.createdAt, order: .reverse)
    private var allPlans: [FitnessPlan]

    private let workoutService = WorkoutService.shared

    private var plan: FitnessPlan? { allPlans.first }

    /// Calendar column for set completions (matches `WorkoutDayCard` / `WorkoutProgramSchedule`).
    private var todaySession: (plan: FitnessPlan, planIndex: Int, day: WorkoutDay, progressDayKey: String)? {
        guard let plan else { return nil }
        guard let planIndex = WorkoutProgramSchedule.planIndex(for: plan, date: .now),
              planIndex >= 0,
              planIndex < plan.workoutPlan.weeklyPlan.count
        else { return nil }
        let day = plan.workoutPlan.weeklyPlan[planIndex]
        let progressDayKey = WorkoutProgramSchedule.progressDayKey(for: day, weekContaining: .now)
        return (plan, planIndex, day, progressDayKey)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Label("Workout", systemImage: "dumbbell")
                    .font(.headline)

                if let session = todaySession {
                    Text(session.day.day)
                        .font(.subheadline.weight(.semibold))
                    Text(session.day.focus)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    ForEach(Array(session.day.enumeratedExerciseSlots()), id: \.globalSlot) { pair in
                        watchExerciseRow(
                            planId: session.plan.id,
                            planIndex: session.planIndex,
                            day: session.day,
                            progressDayKey: session.progressDayKey,
                            globalSlot: pair.globalSlot,
                            exercise: pair.exercise
                        )
                    }
                } else if plan == nil {
                    Text("No plan yet. Generate one on your iPhone.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("No workout scheduled for today.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
        }
        .onAppear {
            if let p = plan {
                workoutService.migrateWorkoutRowProgressKeysIfNeeded(plan: p)
            }
        }
    }

    @ViewBuilder
    private func watchExerciseRow(
        planId: String,
        planIndex: Int,
        day: WorkoutDay,
        progressDayKey: String,
        globalSlot: Int,
        exercise: WorkoutExercise
    ) -> some View {
        let section = WorkoutWebProgress.sectionForExerciseSlot(day: day, globalSlot: globalSlot)
        let webCtx = WorkoutSetProgressContext(
            planId: planId,
            planIndex: planIndex,
            globalSlot: globalSlot,
            section: section,
            workoutDay: day,
            progressDayKey: progressDayKey
        )
        let numSets = exercise.effectiveSetCount

        VStack(alignment: .leading, spacing: 6) {
            Text(exercise.name)
                .font(.caption.weight(.semibold))
                .lineLimit(2)
            Text("\(exercise.sets) × \(exercise.reps)")
                .font(.caption2)
                .foregroundStyle(.secondary)

            HStack(spacing: 6) {
                ForEach(0..<numSets, id: \.self) { setIdx in
                    let done = workoutService.isSetComplete(
                        exerciseName: exercise.name,
                        setIndex: setIdx,
                        dayKey: progressDayKey,
                        planIndex: planIndex,
                        globalSlot: globalSlot,
                        webContext: webCtx,
                        exercise: exercise
                    )
                    Button {
                        workoutService.markSetComplete(
                            exerciseName: exercise.name,
                            setIndex: setIdx,
                            dayKey: progressDayKey,
                            planIndex: planIndex,
                            globalSlot: globalSlot,
                            webContext: webCtx,
                            exerciseForWeb: exercise
                        )
                    } label: {
                        ZStack {
                            Circle()
                                .fill(done ? Color.blue : Color.secondary.opacity(0.2))
                                .frame(width: 28, height: 28)
                            if done {
                                Image(systemName: "checkmark")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.white)
                            } else {
                                Text("\(setIdx + 1)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 4)
    }
}
