import SwiftUI
import SwiftData
import RefactorKit

struct CatchUpBannerView: View {
    let plan: FitnessPlan
    let progress: [String: String]
    @Bindable var planService: PlanService
    let modelContext: ModelContext

    @State private var loadingAction: ScheduleAction?
    @State private var isAskingCoach = false
    @State private var message: String?

    private var missedCount: Int {
        WorkoutScheduleService.countRecentMissed(plan: plan, progress: progress)
    }

    private var visible: Bool {
        WorkoutScheduleService.shouldShowCatchUpBanner(plan: plan, progress: progress)
    }

    var body: some View {
        if visible {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("You missed \(missedCount) workout sessions this week")
                            .font(.headline)
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Dismiss") { dismiss() }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let message {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        if plan.workoutPlan.programWeek1Start != nil && plan.workoutPlan.weeklyPlan.count > 7 {
                            actionButton("Stay on current week", action: .stayOnWeek)
                        }
                        actionButton("Catch up later", action: .catchUp)
                        actionButton("Skip & continue", action: .skipWeek)
                        Button(isAskingCoach ? "Asking coach…" : "Ask coach") {
                            Task { await askCoach() }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(loadingAction != nil || isAskingCoach)
                    }
                }
            }
            .padding()
            .background(Color.orange.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
        }
    }

    private var subtitle: String {
        if plan.workoutPlan.programWeek1Start != nil && plan.workoutPlan.weeklyPlan.count > 7 {
            return "Your program week may have moved ahead. Choose how to get back on track."
        }
        return "Pick whether to catch up, skip ahead, or repeat last week."
    }

    @ViewBuilder
    private func actionButton(_ title: String, action: ScheduleAction) -> some View {
        Button(loadingAction == action ? "Updating…" : title) {
            apply(action)
        }
        .buttonStyle(.bordered)
        .disabled(loadingAction != nil || isAskingCoach)
    }

    private func apply(_ action: ScheduleAction) {
        loadingAction = action
        let summary = planService.applyLocalScheduleAction(action: action, to: plan, progress: progress)
        message = summary
        try? modelContext.save()
        NotificationCenter.default.post(name: .recompSchedulePushSync, object: nil)
        loadingAction = nil
    }

    private func askCoach() async {
        isAskingCoach = true
        defer { isAskingCoach = false }
        do {
            let response = try await planService.adjustSchedule(
                plan: plan,
                progress: progress,
                useAiRecommendation: true
            )
            planService.applyScheduleResponse(response, to: plan)
            message = response.summary
            try? modelContext.save()
            NotificationCenter.default.post(name: .recompSchedulePushSync, object: nil)
        } catch {
            message = "Could not reach coach. Try again."
        }
    }

    private func dismiss() {
        planService.dismissCatchUpBanner(on: plan)
        try? modelContext.save()
        NotificationCenter.default.post(name: .recompSchedulePushSync, object: nil)
    }
}

struct CatchUpQueueView: View {
    let plan: FitnessPlan
    @Bindable var planService: PlanService
    let modelContext: ModelContext
    let onSync: () -> Void
    let onOpenDate: (String) -> Void

    private var queue: [MissedSession] {
        WorkoutScheduleService.getCatchUpQueue(plan: plan)
    }

    var body: some View {
        if !queue.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Catch-up queue (\(queue.count))")
                    .font(.headline)
                Text("Missed sessions you can still complete or reschedule.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                ForEach(queue) { item in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.dayLabel ?? "Workout")
                                .font(.subheadline.weight(.medium))
                            if let focus = item.focus {
                                Text(focus).font(.caption).foregroundStyle(.secondary)
                            }
                            Text("Scheduled \(item.scheduledDate)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Open") {
                            onOpenDate(item.rescheduledTo ?? item.scheduledDate)
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(10)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            .padding(.horizontal)
        }
    }
}
