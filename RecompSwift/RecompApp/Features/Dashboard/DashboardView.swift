import SwiftUI
import SwiftData
import RefactorKit

struct DashboardView: View {
    @Environment(\.modelContext) private var context
    @Environment(AuthService.self) private var auth
    @Environment(\.syncEngine) private var syncEngine
    @State private var mealService = MealService()
    @State private var planService = PlanService()
    @State private var regenerateError: String?
    @State private var showRegenerateSheet = false
    @State private var programWeeks = 1
    @State private var workoutDaysPerWeek = 4
    /// Secondary dashboard cards/widgets mount after the first frame so cold launch
    /// does not register a dozen SwiftData @Query observers before sync runs.
    @State private var secondaryDashboardReady = false

    @Query(sort: \FitnessPlan.createdAt, order: .reverse)
    private var plans: [FitnessPlan]

    @Query private var profiles: [UserProfile]

    @Query(sort: \MealEntry.loggedAt, order: .reverse)
    private var allMeals: [MealEntry]

    /// Observed rather than fetched per render — the activity adjustment used to run a
    /// SwiftData fetch inside `body`.
    @Query private var activityLog: [ActivityLogEntry]

    private var hasPlan: Bool { !plans.isEmpty }

    /// Sum of today's activity calorie adjustments, from the observed query.
    private var todaysActivityAdjustment: Int {
        let today = DateHelpers.todayString()
        return activityLog.reduce(0) { $0 + ($1.date == today ? $1.calorieAdjustment : 0) }
    }

    /// The same row `PlanService.currentPlan(context:)` would fetch, but already observed.
    private var currentPlan: FitnessPlan? { plans.first }
    private var todaysMeals: [MealEntry] {
        let today = DateHelpers.todayString()
        return allMeals.filter { $0.date == today }
    }
    private var profileDaysPerWeek: Int {
        let d = profiles.first?.workoutDaysPerWeek ?? 4
        return min(7, max(2, d))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    greetingSection

                    if !hasPlan && !planService.isGenerating {
                        noPlanSection
                    }

                    if planService.isGenerating {
                        planGeneratingSection
                    }

                    // Hero: the two things the user opened the app to see.
                    calorieBudgetSection
                    todaysPlanSection

                    if secondaryDashboardReady {
                        // The differentiator, above the fold rather than buried in Workouts.
                        TrainingBlockCard()
                            .padding(.horizontal)

                        MetabolicModelDashboardCard()
                        DietPhaseDashboardCard()
                            .padding(.horizontal)
                        CoachCheckInDashboardCard()
                            .padding(.horizontal)
                        widgetGrid
                    }
                }
                .padding(.vertical)
            }
            .navigationTitle("Dashboard")
            .coachToolbarItem()
            .onAppear {
                workoutDaysPerWeek = profileDaysPerWeek
                guard !secondaryDashboardReady else { return }
                Task { @MainActor in
                    await Task.yield()
                    secondaryDashboardReady = true
                }
            }
            .onChange(of: profileDaysPerWeek) { _, newValue in
                workoutDaysPerWeek = newValue
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if hasPlan {
                        Button {
                            showRegenerateSheet = true
                        } label: {
                            if planService.isGenerating {
                                ProgressView()
                            } else {
                                Label("Regenerate Plan", systemImage: "arrow.clockwise")
                            }
                        }
                        .disabled(planService.isGenerating)
                    }
                }
            }
            .sheet(isPresented: $showRegenerateSheet) {
                RegeneratePlanSheet(
                    programWeeks: $programWeeks,
                    workoutDaysPerWeek: $workoutDaysPerWeek,
                    isGenerating: planService.isGenerating,
                    onGenerate: {
                        showRegenerateSheet = false
                        Task { await regeneratePlan() }
                    }
                )
                .presentationDetents([.medium])
            }
            .refreshable {
                await auth.checkSession()
                if let engine = syncEngine {
                    do {
                        try await engine.fetchAndApply()
                    } catch {
                        if !SyncPullErrorFiltering.shouldSuppressUserAlert(for: error) {
                            ToastCenter.show("Sync failed — pull to try again", type: .error)
                        }
                    }
                }
            }
            .alert("Couldn't regenerate plan", isPresented: Binding(
                get: { regenerateError != nil },
                set: { if !$0 { regenerateError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(regenerateError ?? "")
            }
        }
    }

    private var noPlanSection: some View {
        VStack(spacing: 12) {
            Text("No plan yet")
                .font(.headline)
            Text("Generate a personalized meal and workout plan from your profile.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            PlanGenerateOptionsView(
                programWeeks: $programWeeks,
                workoutDaysPerWeek: $workoutDaysPerWeek
            )
            Button("Generate my plan") {
                Task { await regeneratePlan() }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .cardSurface(cornerRadius: 16)
        .padding(.horizontal)
    }

    private var planGeneratingSection: some View {
        VStack(spacing: 10) {
            ProgressView()
            Text("Creating your plan…")
                .font(.headline)
            Text(programWeeks > 1
                 ? "Building your \(programWeeks)-week program. This may take a few minutes."
                 : "This can take up to a minute.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .cardSurface(cornerRadius: 16)
        .padding(.horizontal)
    }

    private func regeneratePlan() async {
        regenerateError = nil
        let options = RegeneratePlanOptions(
            programWeeks: programWeeks > 1 ? programWeeks : nil,
            workoutDaysPerWeek: workoutDaysPerWeek,
            reason: nil
        )
        do {
            _ = try await planService.regeneratePlan(context: context, options: options)
            _ = await syncEngine?.syncNow()
            ToastCenter.celebrate()
            ToastCenter.show("Your plan is ready", type: .success)
        } catch {
            Haptics.error()
            regenerateError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Consecutive days (up to today) with at least one logged meal.
    private var loggingStreak: Int {
        DateHelpers.streakLength(dates: Array(Set(allMeals.map(\.date))))
    }

    private var greetingSection: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(greetingText)
                    .font(.title2.weight(.bold))
                Text(DateHelpers.todayString())
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if loggingStreak >= 2 {
                StreakBadge(days: loggingStreak)
            }
            AvatarView(dataUrl: auth.currentUser?.avatarDataUrl, name: auth.currentUser?.name ?? "User", size: 44)
        }
        .padding(.horizontal)
    }

    private var calorieBudgetSection: some View {
        VStack(spacing: 12) {
            let consumed = todaysMeals.reduce(Macros.zero) { $0.adding($1.macros) }
            let targets = planService.todaysTargets(plan: currentPlan)
            let activityAdj = todaysActivityAdjustment
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
            if let workout = planService.todaysWorkout(plan: currentPlan) {
                HStack(spacing: 14) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(LinearGradient.appAccentGradient)
                            .frame(width: 48, height: 48)
                        Image(systemName: "dumbbell.fill")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.white)
                            .accessibilityHidden(true)
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
                .cardSurface(cornerRadius: 18, borderColor: Color.appAccent.opacity(0.2))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Today's workout: \(workout.day), \(workout.focus), \(workout.exerciseSlotCount) exercises")
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

private struct PlanGenerateOptionsView: View {
    @Binding var programWeeks: Int
    @Binding var workoutDaysPerWeek: Int

    private let weekOptions = [1, 4, 8, 12]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Program length")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                HStack(spacing: 8) {
                    ForEach(weekOptions, id: \.self) { weeks in
                        Button {
                            programWeeks = weeks
                        } label: {
                            Text(weeks == 1 ? "1 wk" : "\(weeks) wks")
                                .font(.subheadline.weight(.medium))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(
                                    programWeeks == weeks ? Color.appAccent : Color.gray.opacity(0.12),
                                    in: Capsule()
                                )
                                .foregroundStyle(programWeeks == weeks ? Color.white : Color.primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                if programWeeks > 1 {
                    Text("Multi-week programs build in chunks and may take a few minutes.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Training days per week")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                Picker("Training days", selection: $workoutDaysPerWeek) {
                    ForEach(2...7, id: \.self) { d in
                        Text("\(d) days").tag(d)
                    }
                }
                .pickerStyle(.menu)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct RegeneratePlanSheet: View {
    @Binding var programWeeks: Int
    @Binding var workoutDaysPerWeek: Int
    let isGenerating: Bool
    let onGenerate: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Text("Build a fresh meal and workout plan. This replaces your current program.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                PlanGenerateOptionsView(
                    programWeeks: $programWeeks,
                    workoutDaysPerWeek: $workoutDaysPerWeek
                )
                Spacer()
                Button {
                    onGenerate()
                } label: {
                    Text(isGenerating ? "Generating…" : "Regenerate plan")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isGenerating)
            }
            .padding()
            .navigationTitle("Regenerate program")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

/// A flame badge showing the current consecutive-day logging streak.
struct StreakBadge: View {
    let days: Int

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
                .font(.caption)
                .foregroundStyle(LinearGradient(
                    colors: [Color.appWarm, Color.appError],
                    startPoint: .top, endPoint: .bottom
                ))
            Text("\(days)")
                .font(.subheadline.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(Color.primary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.appWarm.opacity(0.14), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(days) day logging streak")
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
        .cardSurface(
            cornerRadius: 20,
            borderColor: (isOver ? Color.appError : Color.appAccent).opacity(0.15)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Calorie budget")
        .accessibilityValue(
            isOver
            ? "Over budget by \(consumed - target) calories. \(consumed) of \(target) consumed."
            : "\(remaining) calories remaining. \(consumed) of \(target) consumed, \(pctConsumed) percent."
        )
    }
}
