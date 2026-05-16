import SwiftUI
import SwiftData
import RefactorKit

struct DashboardView: View {
    @Environment(\.modelContext) private var context
    @Environment(AuthService.self) private var auth
    @Environment(\.syncEngine) private var syncEngine
    @State private var mealService = MealService()
    @State private var planService = PlanService()
    @State private var syncError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    greetingSection
                    calorieBudgetSection
                    todaysPlanSection
                    MetabolicModelDashboardCard()
                        .padding(.horizontal)
                    CoachCheckInDashboardCard()
                        .padding(.horizontal)
                    widgetGrid
                }
                .padding(.vertical)
            }
            .navigationTitle("Dashboard")
            .refreshable {
                await auth.checkSession()
                if let engine = syncEngine {
                    do {
                        try await engine.fetchAndApply()
                    } catch {
                        if !SyncPullErrorFiltering.shouldSuppressUserAlert(for: error) {
                            syncError = error.localizedDescription
                        }
                    }
                }
            }
            .alert("Sync Failed", isPresented: Binding(
                get: { syncError != nil },
                set: { if !$0 { syncError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(syncError ?? "")
            }
        }
    }

    private var greetingSection: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(greetingText)
                    .font(.title2.weight(.bold))
                Text(DateHelpers.todayString())
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            AvatarView(dataUrl: auth.currentUser?.avatarDataUrl, name: auth.currentUser?.name ?? "User", size: 44)
        }
        .padding(.horizontal)
    }

    private var calorieBudgetSection: some View {
        VStack(spacing: 12) {
            let consumed = mealService.todaysMacros(context: context)
            let targets = planService.todaysTargets(context: context)
            let activityAdj = mealService.todaysActivityCalorieAdjustment(context: context)
            let adjustedCalorieTarget = targets.calories + activityAdj

            CalorieBudgetCard(
                consumed: consumed.calories,
                target: adjustedCalorieTarget,
                baseCalories: targets.calories,
                activityAdjustment: activityAdj
            )
            MacroPillsView(consumed: consumed, target: targets)
        }
        .padding(.horizontal)
    }

    private var todaysPlanSection: some View {
        Group {
            if let workout = planService.todaysWorkout(context: context) {
                HStack(spacing: 14) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(LinearGradient.appAccentGradient)
                            .frame(width: 48, height: 48)
                        Image(systemName: "dumbbell.fill")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.white)
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text("TODAY'S WORKOUT")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Color.appAccent)
                            .tracking(1)
                        Text(workout.day)
                            .font(.headline)
                        Text(workout.focus)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(workout.exerciseSlotCount)")
                            .font(.system(.title2, design: .rounded, weight: .black))
                            .foregroundStyle(Color.appAccent)
                        Text("exercises")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(14)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(Color.appAccent.opacity(0.2), lineWidth: 1)
                )
            }
        }
        .padding(.horizontal)
    }

    private var widgetGrid: some View {
        LazyVGrid(columns: [.init(.flexible(), alignment: .top), .init(.flexible(), alignment: .top)], spacing: 12) {
            HydrationWidget()
            FastingWidget()
            BiofeedbackCard()
            DailyQuestsCard()
        }
        .padding(.horizontal)
    }

    private var greetingText: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let name = auth.currentUser?.name.split(separator: " ").first.map(String.init) ?? "there"
        switch hour {
        case 0..<12: return "Good morning, \(name)"
        case 12..<17: return "Good afternoon, \(name)"
        default: return "Good evening, \(name)"
        }
    }
}

struct CalorieBudgetCard: View {
    let consumed: Int
    /// Calorie budget after activity adjustments (same as web `adjustedBudget`).
    let target: Int
    /// Plan base calories before activity delta; used for the footnote when `activityAdjustment != 0`.
    var baseCalories: Int? = nil
    var activityAdjustment: Int = 0

    private var remaining: Int { max(target - consumed, 0) }
    private var isOver: Bool { consumed > target }
    private var progress: Double { min(Double(consumed) / Double(max(target, 1)), 1.0) }
    private var pctConsumed: Int { Int(progress * 100) }

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(isOver ? "Over Budget" : "Remaining")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(isOver ? Color.appError : Color.secondary)
                        .textCase(.uppercase)
                        .tracking(0.5)
                    Text(isOver ? "+\(consumed - target)" : "\(remaining)")
                        .font(.system(size: 42, weight: .black, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(isOver ? Color.appError : Color.primary)
                        .contentTransition(.numericText())
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text("\(pctConsumed)%")
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(progress > 0.9 ? Color.appWarm : Color.appAccent)
                    Text("\(consumed) / \(target) kcal")
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }

            if let base = baseCalories, activityAdjustment != 0 {
                Text("\(base) base \(activityAdjustment > 0 ? "+" : "")\(activityAdjustment) activity")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(.gray.opacity(0.12))

                    RoundedRectangle(cornerRadius: 8)
                        .fill(progress > 0.9 ? LinearGradient.appWarningGradient : LinearGradient.appAccentGradient)
                        .frame(width: geo.size.width * progress)
                        .animation(.spring(duration: 0.5), value: progress)
                }
            }
            .frame(height: 16)
        }
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke((isOver ? Color.appError : Color.appAccent).opacity(0.15), lineWidth: 1)
        )
    }
}
