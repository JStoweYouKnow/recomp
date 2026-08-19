import SwiftUI
import SwiftData
import RefactorKit

/// The training block, stated in one line on the dashboard.
///
/// This is the app's actual differentiator — no calorie tracker can tell a lifter
/// "your bench and row stalled, so the deload came early" — and it was rendering
/// partway down the Workouts scroll, below a recovery button and a volume card. A
/// user who never opens Workouts never learns the product is doing this at all.
struct TrainingBlockCard: View {
    @Environment(\.modelContext) private var context
    @Environment(AppCoordinator.self) private var coordinator
    @State private var planService = PlanService()
    private let workoutService = WorkoutService.shared

    @Query(sort: \FitnessPlan.createdAt, order: .reverse)
    private var plans: [FitnessPlan]

    /// Recomputed only when `inputsToken` changes — see `recomputeResolution()`.
    @State private var resolution: Mesocycle.Resolution?

    private var currentPlan: FitnessPlan? { plans.first }

    var body: some View {
        Group {
            if let resolution {
                content(resolution)
            }
        }
        // Resolving the block walks every logged set once per tracked exercise. On the
        // Dashboard — the default tab — that cannot run on every body evaluation.
        .task(id: inputsToken) {
            recomputeResolution()
        }
    }

    /// Cheap key: changes only when the plan or the logged sets change.
    private var inputsToken: String {
        "\(currentPlan?.id ?? "none")-\(WorkoutSetLogStorage.generation)"
    }

    @ViewBuilder
    private func content(_ resolution: Mesocycle.Resolution) -> some View {
        let state = resolution.state

        Button {
            coordinator.navigate(to: .workouts)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(state.phase.label.uppercased())
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(tint(state.phase))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(tint(state.phase).opacity(0.14), in: Capsule())

                    Text("Week \(state.weekInBlock) of \(state.blockLength)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)

                    if resolution.deloadForced {
                        Text("Pulled forward")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.appWarm)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.appWarm.opacity(0.15), in: Capsule())
                    }

                    Spacer(minLength: 0)

                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }

                Text(headline(resolution))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)

                // Week dots make the block's shape legible at a glance.
                HStack(spacing: 4) {
                    ForEach(1...max(1, state.blockLength), id: \.self) { week in
                        Capsule()
                            .fill(dotColor(week: week, state: state))
                            .frame(height: 5)
                    }
                }
                .accessibilityHidden(true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.recompSurface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(tint(state.phase).opacity(0.22), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Training block")
        .accessibilityValue(
            "\(state.phase.label), week \(state.weekInBlock) of \(state.blockLength). \(headline(resolution))"
        )
        .accessibilityHint("Opens your workouts")
    }

    /// Prefers the concrete reason a deload was pulled forward over the generic phase
    /// summary — the specific sentence is the one no competitor can print.
    private func headline(_ resolution: Mesocycle.Resolution) -> String {
        if resolution.deloadForced, let reason = resolution.deload.reasons.first {
            return "Deload came early — \(reason.lowercased())"
        }
        if resolution.deload.urgency == .soon, let reason = resolution.deload.reasons.first {
            return "A deload is coming — \(reason.lowercased())"
        }
        return resolution.state.summary
    }

    private func tint(_ phase: Mesocycle.Phase) -> Color {
        switch phase {
        case .accumulation: return .appAccent
        case .peak: return .appSage
        case .deload: return .appWarm
        }
    }

    private func dotColor(week: Int, state: Mesocycle.State) -> Color {
        if week == state.weekInBlock { return .appAccent }
        if week < state.weekInBlock { return Color.appAccent.opacity(0.4) }
        if week == state.blockLength { return Color.appWarm.opacity(0.3) }
        return Color.secondary.opacity(0.15)
    }

    // MARK: - Resolution

    /// Mirrors the Workouts tab's computation so both surfaces always agree.
    private func recomputeResolution() {
        guard let plan = currentPlan else {
            resolution = nil
            return
        }
        let today = DateHelpers.todayString()
        let logs = WorkoutSetLogStorage.load()
        let progress = workoutService.webWorkoutProgressMergedForSync(plan: plan)
        let programWeek = WorkoutScheduleService.trainingWeeksElapsed(for: plan, today: today)

        let weeklyVolume = WorkoutAnalyticsCache.weeklyVolume(
            weekStart: DateHelpers.mondayWeekStartString(containingCalendarDay: today)
        )

        let signals: Mesocycle.FatigueSignals? = logs.isEmpty ? nil : Mesocycle.buildFatigueSignals(
            progressions: WorkoutAnalyticsCache.progressions(),
            setLogs: logs,
            musclesOverMrv: weeklyVolume.overdosed.count,
            readinessScore: nil,
            missedSessions: WorkoutScheduleService.countRecentMissed(
                plan: plan, progress: progress, days: 7, today: today
            ),
            today: today
        )

        resolution = Mesocycle.resolve(programWeek: programWeek, signals: signals)
    }
}
