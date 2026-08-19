import SwiftUI
import SwiftData
import UniformTypeIdentifiers
import RefactorKit

struct WorkoutsView: View {
    @Environment(\.modelContext) private var context
    @State private var planService = PlanService()
    private let workoutService = WorkoutService.shared
    @State private var selectedDate = Date.now
    @State private var recoveryAssessment: RecoveryAssessment?
    @State private var isLoadingRecovery = false
    @State private var recoveryError: String?
    @State private var editRoute: WorkoutDayEditRoute?
    @State private var showImportSheet = false
    @State private var restTimer: RestTimerState?
    /// Recomputed only when `mesocycleInputsToken` changes — see `recomputeMesocycle()`.
    @State private var mesocycleResolution: Mesocycle.Resolution?

    @Query(sort: \FitnessPlan.createdAt, order: .reverse)
    private var allPlans: [FitnessPlan]

    @Query(sort: \BiofeedbackEntry.time, order: .reverse)
    private var biofeedbackEntries: [BiofeedbackEntry]

    @Query private var profiles: [UserProfile]

    private var currentPlan: FitnessPlan? { allPlans.first }

    /// The unit the lifter chose at signup. Set logs stay in pounds; only entry and
    /// display are converted.
    private var massUnit: MassUnit {
        MassUnit(system: profiles.first?.unitSystem ?? .us)
    }

    private var todaysBiofeedback: BiofeedbackEntry? {
        biofeedbackEntries.first { $0.date == DateHelpers.todayString() }
    }

    private var isSelectedDateFuture: Bool {
        Calendar.current.startOfDay(for: selectedDate) > Calendar.current.startOfDay(for: .now)
    }

    private var isSelectedDatePast: Bool {
        Calendar.current.startOfDay(for: selectedDate) < Calendar.current.startOfDay(for: .now)
    }

    private var workoutProgressDotDates: Set<String> {
        workoutService.calendarDatesWithProgress()
    }

    private func selectedWorkoutItem(plan: FitnessPlan) -> WorkoutPlanDisplayItem? {
        guard let idx = WorkoutProgramSchedule.planIndex(for: plan, date: selectedDate) else { return nil }
        return WorkoutProgramSchedule.displayedPlanItems(plan: plan, selectedDate: selectedDate)
            .first { $0.planIndex == idx }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                CalendarStripView(selectedDate: $selectedDate, dotDates: workoutProgressDotDates)
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .padding(.bottom, 4)

                ZStack(alignment: .bottom) {
                ScrollView {
                    VStack(spacing: 16) {
                        recoverySection

                        if let resolution = mesocycleResolution {
                            MesocycleBanner(resolution: resolution)
                        }

                        WeeklyVolumeCard(summary: weeklyVolumeSummary)

                        if let plan = currentPlan {
                            CatchUpBannerView(
                                plan: plan,
                                progress: workoutService.webWorkoutProgressMergedForSync(plan: plan),
                                planService: planService,
                                modelContext: context
                            )

                            CatchUpQueueView(
                                plan: plan,
                                planService: planService,
                                modelContext: context,
                                onSync: { NotificationCenter.default.post(name: .recompScheduleDataSync, object: nil) },
                                onOpenDate: { dateStr in
                                    if let d = DateHelpers.date(from: dateStr) {
                                        selectedDate = d
                                    }
                                }
                            )

                            if let item = selectedWorkoutItem(plan: plan) {
                                let progressKey = WorkoutProgramSchedule.progressDayKey(
                                    for: item.day,
                                    weekContaining: selectedDate
                                )
                                let todayKey = DateHelpers.todayString()
                                let allDone = workoutService.isWorkoutDayFullyComplete(
                                    item.day,
                                    dayKey: progressKey,
                                    planIndex: item.planIndex,
                                    planId: plan.id
                                )
                                let isMissed = isSelectedDatePast
                                    && item.day.exerciseSlotCount > 0
                                    && !allDone

                                WorkoutDayCard(
                                    planId: plan.id,
                                    day: item.day,
                                    workoutService: workoutService,
                                    progressDayKey: progressKey,
                                    planIndex: item.planIndex,
                                    isToday: progressKey == todayKey,
                                    isMissed: isMissed,
                                    setsDisabled: isSelectedDateFuture,
                                    recoveryModifier: recoveryModifier(for: item.day),
                                    readinessScore: recoveryAssessment?.score,
                                    mesocycleState: mesocycleResolution?.state,
                                    massUnit: massUnit,
                                    onEdit: {
                                        editRoute = WorkoutDayEditRoute(planIndex: item.planIndex)
                                    },
                                    onStartRestTimer: { exerciseName, seconds in
                                        withAnimation(.spring(duration: 0.3)) {
                                            restTimer = RestTimerState(
                                                exerciseName: exerciseName,
                                                endDate: .now.addingTimeInterval(TimeInterval(seconds)),
                                                totalSeconds: seconds
                                            )
                                        }
                                        RestTimerNotifier.schedule(after: seconds, exerciseName: exerciseName)
                                    },
                                    onCancelRestTimer: {
                                        withAnimation { restTimer = nil }
                                        RestTimerNotifier.cancel()
                                    }
                                )
                            } else {
                                RestDayWorkoutState(selectedDate: selectedDate)
                            }
                        } else {
                            EmptyStateView(
                                icon: "dumbbell",
                                title: "No Workout Plan",
                                subtitle: "Generate a plan from the Dashboard to see your weekly workouts"
                            )
                            .padding(.top, 40)
                        }
                    }
                    .padding(.vertical)
                }
                .scrollDismissesKeyboard(.interactively)

                    if let restTimer {
                        RestTimerBanner(
                            state: restTimer,
                            onSkip: {
                                withAnimation { self.restTimer = nil }
                                RestTimerNotifier.cancel()
                            },
                            onAdd15: {
                                withAnimation {
                                    self.restTimer?.extend(by: 15)
                                }
                                if let end = self.restTimer?.endDate {
                                    RestTimerNotifier.schedule(
                                        after: Int(end.timeIntervalSinceNow.rounded()),
                                        exerciseName: self.restTimer?.exerciseName ?? ""
                                    )
                                }
                            },
                            onFinished: {
                                Haptics.chime()
                                withAnimation { self.restTimer = nil }
                                RestTimerNotifier.cancel()
                            }
                        )
                        .padding(.horizontal)
                        .padding(.bottom, 8)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
            }
            .navigationTitle("Workouts")
            .coachToolbarItem()
            .task(id: mesocycleInputsToken) {
                recomputeMesocycle()
            }
            .onAppear {
                if let plan = currentPlan {
                    workoutService.migrateWorkoutRowProgressKeysIfNeeded(plan: plan)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .recompSkipTodayWorkout)) { _ in
                guard let plan = planService.currentPlan(context: context) else { return }
                _ = planService.applyLocalScheduleAction(
                    action: .skipToday,
                    to: plan,
                    progress: workoutService.webWorkoutProgressMergedForSync(plan: plan)
                )
                try? context.save()
                NotificationCenter.default.post(name: .recompSchedulePushSync, object: nil)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if currentPlan != nil {
                            Button {
                                showImportSheet = true
                            } label: {
                                Label("Import from URL", systemImage: "link.badge.plus")
                            }
                        }
                        Button {
                            withAnimation { workoutService.resetDayProgress(dayKey: DateHelpers.todayString()) }
                        } label: {
                            Label("Reset today's progress", systemImage: "arrow.counterclockwise.circle")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Workout options")
                }
            }
            .keyboardDoneButton()
            .sheet(item: $editRoute) { route in
                NavigationStack {
                    if let plan = currentPlan {
                        EditWorkoutDayView(plan: plan, planIndex: route.planIndex)
                    } else {
                        Text("No workout plan")
                            .padding()
                    }
                }
            }
            .sheet(isPresented: $showImportSheet) {
                if let plan = currentPlan {
                    WorkoutImportSheet(plan: plan)
                }
            }
        }
    }

    // MARK: - Weekly volume

    /// Hard sets per muscle for the current Monday-start week, from all logged sets.
    /// Memoised against the set-log generation — this used to rescan every log on each
    /// body evaluation.
    private var weeklyVolumeSummary: MuscleVolume.Summary {
        WorkoutAnalyticsCache.weeklyVolume(
            weekStart: DateHelpers.mondayWeekStartString(containingCalendarDay: DateHelpers.todayString())
        )
    }

    // MARK: - Training block

    /// Current block phase, with an early deload substituted when fatigue signals
    /// (stalls, RPE creep, volume past MRV, low readiness, missed sessions) demand one.
    ///
    /// Held in `@State` rather than computed per body pass: building the fatigue signals
    /// walks every logged set once per tracked exercise, which is far too expensive to
    /// repeat on every render.
    private func recomputeMesocycle() {
        guard let plan = currentPlan else {
            mesocycleResolution = nil
            return
        }
        let today = DateHelpers.todayString()
        let logs = WorkoutSetLogStorage.load()
        let progress = workoutService.webWorkoutProgressMergedForSync(plan: plan)
        let programWeek = WorkoutScheduleService.trainingWeeksElapsed(for: plan, today: today)

        let signals: Mesocycle.FatigueSignals? = logs.isEmpty ? nil : Mesocycle.buildFatigueSignals(
            progressions: WorkoutAnalyticsCache.progressions(),
            setLogs: logs,
            musclesOverMrv: weeklyVolumeSummary.overdosed.count,
            readinessScore: recoveryAssessment?.score,
            missedSessions: WorkoutScheduleService.countRecentMissed(
                plan: plan, progress: progress, days: 7, today: today
            ),
            today: today
        )

        mesocycleResolution = Mesocycle.resolve(programWeek: programWeek, signals: signals)
    }

    /// Cheap key that changes only when something the block state depends on changes.
    private var mesocycleInputsToken: String {
        "\(currentPlan?.id ?? "none")-\(WorkoutSetLogStorage.generation)-\(recoveryAssessment?.score.description ?? "nil")"
    }

    // MARK: - Recovery section

    @ViewBuilder
    private var recoverySection: some View {
        if let assessment = recoveryAssessment {
            RecoveryCard(assessment: assessment) {
                withAnimation { recoveryAssessment = nil }
            }
            .padding(.horizontal)
        } else if let bf = todaysBiofeedback {
            VStack(spacing: 6) {
                Button {
                    Task { await checkRecovery(bf) }
                } label: {
                    HStack(spacing: 8) {
                        if isLoadingRecovery {
                            ProgressView().scaleEffect(0.8)
                            Text("Assessing recovery…")
                        } else {
                            Image(systemName: "heart.text.square.fill")
                                .foregroundStyle(Color.appSuccess)
                            Text("Check Today's Recovery")
                                .fontWeight(.medium)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                }
                .buttonStyle(.bordered)
                .tint(Color.appSuccess)
                .padding(.horizontal)
                .disabled(isLoadingRecovery)

                if let recoveryError {
                    Text(recoveryError)
                        .font(.caption)
                        .foregroundStyle(Color.appError)
                        .padding(.horizontal)
                }
            }
        }
    }

    private func checkRecovery(_ bf: BiofeedbackEntry) async {
        isLoadingRecovery = true
        recoveryError = nil
        do {
            recoveryAssessment = try await workoutService.assessRecovery(biofeedback: [
                "energy": bf.energy,
                "mood": bf.mood,
                "hunger": bf.hunger,
                "stress": bf.stress,
                "soreness": bf.soreness
            ])
        } catch {
            recoveryError = error.localizedDescription
        }
        isLoadingRecovery = false
    }

    private func recoveryModifier(for day: WorkoutDay) -> Double? {
        recoveryAssessment?.modifiedWorkout?.volumeAdjustment
    }
}

private struct WorkoutDayEditRoute: Identifiable, Hashable {
    let planIndex: Int
    var id: Int { planIndex }
}

private struct RestDayWorkoutState: View {
    let selectedDate: Date

    var body: some View {
        EmptyStateView(
            icon: "figure.walk",
            title: "Rest Day",
            subtitle: "No workout scheduled for \(DateHelpers.dayOfWeekShort(selectedDate))."
        )
        .padding(.top, 24)
    }
}

// MARK: - Recovery Card

struct RecoveryCard: View {
    let assessment: RecoveryAssessment
    let onDismiss: () -> Void

    private var levelColor: Color {
        switch assessment.level {
        case .low: return .appError
        case .moderate: return .appWarm
        case .high: return .appSage
        case .optimal: return .appSuccess
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label {
                    Text("Recovery: \(assessment.level.rawValue.capitalized)")
                        .font(.headline)
                } icon: {
                    Image(systemName: "heart.text.square.fill")
                        .foregroundStyle(levelColor)
                }
                Spacer()
                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss recovery assessment")
            }

            // Score bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(.gray.opacity(0.15))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(levelColor)
                        .frame(width: geo.size.width * min(assessment.score, 1.0))
                }
                .clipped()
            }
            .frame(height: 8)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Recovery score")
            .accessibilityValue("\(Int(min(assessment.score, 1.0) * 100)) percent")

            Text(assessment.recommendation)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if let mod = assessment.modifiedWorkout {
                HStack(spacing: 16) {
                    adjustmentPill("Volume", value: mod.volumeAdjustment)
                    adjustmentPill("Intensity", value: mod.intensityAdjustment)
                }

                if !mod.suggestedSwaps.isEmpty {
                    Divider()
                    Text("Suggested Swaps")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    ForEach(mod.suggestedSwaps, id: \.original) { swap in
                        HStack(spacing: 6) {
                            Text(swap.original)
                                .strikethrough()
                                .foregroundStyle(.secondary)
                            Image(systemName: "arrow.right")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text(swap.replacement)
                                .foregroundStyle(.primary)
                        }
                        .font(.caption)
                    }
                }
            }
        }
        .padding()
        .cardSurface(cornerRadius: 16, borderColor: levelColor.opacity(0.3))
    }

    private func adjustmentPill(_ label: String, value: Double) -> some View {
        let pct = Int((value - 1.0) * 100)
        let color: Color = value < 1 ? .appWarm : value > 1 ? .appSuccess : .secondary
        return HStack(spacing: 4) {
            Text(label).font(.caption2)
            Text(pct >= 0 ? "+\(pct)%" : "\(pct)%")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(color)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.1), in: Capsule())
    }
}

// MARK: - Workout Day Card

struct WorkoutDayCard: View {
    let planId: String
    let day: WorkoutDay
    let workoutService: WorkoutService
    let progressDayKey: String
    let planIndex: Int
    var isToday: Bool = false
    var isMissed: Bool = false
    var setsDisabled: Bool = false
    var recoveryModifier: Double? = nil
    /// 0–100 recovery score; low readiness suppresses prescribed load jumps.
    var readinessScore: Double? = nil
    /// Current block phase; scales prescribed sets and load (deload weeks cut both).
    var mesocycleState: Mesocycle.State? = nil
    /// The unit the lifter types weights in; storage stays in pounds.
    var massUnit: MassUnit = .pounds
    var onEdit: (() -> Void)? = nil
    var onStartRestTimer: ((String, Int) -> Void)? = nil
    var onCancelRestTimer: (() -> Void)? = nil

    @State private var isExpanded: Bool
    @State private var gifData: [String: Data] = [:]
    @State private var loadingGifs: Set<String> = []
    @State private var gifErrors: [String: String] = [:]
    @State private var summary: WorkoutDaySummary?
    /// Non-nil once the session has an explicit start; drives the live elapsed clock.
    @State private var sessionStart: Date?
    @State private var musicSuggestions: [PlaylistSuggestion] = []
    @State private var isLoadingMusic = false
    @State private var showMusic = false
    @State private var musicError: String?

    init(
        planId: String,
        day: WorkoutDay,
        workoutService: WorkoutService,
        progressDayKey: String,
        planIndex: Int,
        isToday: Bool = false,
        isMissed: Bool = false,
        setsDisabled: Bool = false,
        recoveryModifier: Double? = nil,
        readinessScore: Double? = nil,
        mesocycleState: Mesocycle.State? = nil,
        massUnit: MassUnit = .pounds,
        onEdit: (() -> Void)? = nil,
        onStartRestTimer: ((String, Int) -> Void)? = nil,
        onCancelRestTimer: (() -> Void)? = nil
    ) {
        self.planId = planId
        self.day = day
        self.workoutService = workoutService
        self.progressDayKey = progressDayKey
        self.planIndex = planIndex
        self.isToday = isToday
        self.isMissed = isMissed
        self.setsDisabled = setsDisabled
        self.recoveryModifier = recoveryModifier
        self.readinessScore = readinessScore
        self.mesocycleState = mesocycleState
        self.massUnit = massUnit
        self.onEdit = onEdit
        self.onStartRestTimer = onStartRestTimer
        self.onCancelRestTimer = onCancelRestTimer
        _isExpanded = State(initialValue: isToday || isMissed)
    }

    private var allExercisesComplete: Bool {
        totalExercises > 0 && completedExercises == totalExercises
    }

    /// Computed load target per normalized exercise name for this day's main + finisher work.
    /// Warmups are excluded — they are not load-progressed.
    ///
    /// Memoised: prescribing walks the whole log history per exercise, and this card
    /// re-renders on every set tap.
    private var prescriptions: [String: Progression.SetPrescription] {
        let intensity = mesocycleState?.intensityMultiplier ?? 1
        let volume = mesocycleState?.volumeMultiplier ?? 1
        return WorkoutAnalyticsCache.prescriptions(
            cacheKey: "\(planId)|\(progressDayKey)|\(planIndex)|\(readinessScore ?? -1)|\(intensity)|\(volume)",
            exercises: day.exercises + (day.finishers ?? []),
            options: Progression.Options(
                readinessScore: readinessScore,
                intensityMultiplier: intensity,
                volumeMultiplier: volume
            )
        )
    }

    /// Matches web planner header: completed / total **exercises** (rows), not sum of sets.
    private var totalExercises: Int { day.exerciseSlotCount }

    private var completedExercises: Int {
        workoutService.completedExerciseCount(for: day, dayKey: progressDayKey, planIndex: planIndex, planId: planId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header: expand row + optional edit
            HStack(spacing: 0) {
                Button {
                    withAnimation(.spring(duration: 0.3)) { isExpanded.toggle() }
                } label: {
                    HStack(spacing: 12) {
                        if isToday {
                            Circle()
                                .fill(Color.appAccent)
                                .frame(width: 8, height: 8)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(day.day)
                                    .font(.headline)
                                    .foregroundStyle(isToday ? Color.appAccent : Color.primary)
                                if isMissed {
                                    Text("Missed")
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(Color.appWarm)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.appWarm.opacity(0.15), in: Capsule())
                                }
                            }
                            Text(day.focus)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        // Progress: completed / total **exercise rows** (web planner parity), not sum of sets.
                        if totalExercises > 0 {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(completedExercises)/\(totalExercises)")
                                    .font(.caption.weight(.bold))
                                    .monospacedDigit()
                                    .foregroundStyle(completedExercises == totalExercises ? Color.appSuccess : Color.primary)
                                    .contentTransition(.numericText())
                                Text("done")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(
                                (completedExercises == totalExercises ? Color.appSuccess : Color.secondary)
                                    .opacity(0.12),
                                in: Capsule()
                            )
                        }
                        Image(systemName: "chevron.right")
                            .rotationEffect(.degrees(isExpanded ? 90 : 0))
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    }
                    .padding()
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if let onEdit {
                    Button {
                        onEdit()
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .font(.body)
                            .foregroundStyle(Color.appAccent)
                            .padding(.trailing, 12)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Edit workout")
                }
            }

            if isExpanded {
                Divider()

                VStack(alignment: .leading, spacing: 0) {
                    if totalExercises > 0 {
                        sessionBar
                    }

                    if let warmups = day.warmups, !warmups.isEmpty {
                        exerciseSection("Warm-up", exercises: warmups, color: .appWarm, sectionKey: "warmup", baseGlobalSlot: 0)
                    }
                    exerciseSection(
                        "Main",
                        exercises: day.exercises,
                        color: .appAccent,
                        sectionKey: "main",
                        baseGlobalSlot: day.warmups?.count ?? 0
                    )
                    if let finishers = day.finishers, !finishers.isEmpty {
                        exerciseSection(
                            "Finisher",
                            exercises: finishers,
                            color: .appSlate,
                            sectionKey: "finisher",
                            baseGlobalSlot: (day.warmups?.count ?? 0) + day.exercises.count
                        )
                    }

                    // Recovery volume note
                    if let mod = recoveryModifier, mod != 1.0 {
                        let pct = Int((mod - 1.0) * 100)
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(Color.appWarm)
                                .font(.caption)
                            Text("Recovery suggests \(pct >= 0 ? "+\(pct)%" : "\(pct)%") volume today")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal)
                        .padding(.top, 4)
                    }

                    // Music button
                    musicSection
                        .padding(.bottom, 8)
                }
            }
        }
        .cardSurface(
            cornerRadius: 16,
            borderColor: isMissed ? Color.appWarm.opacity(0.45) : nil,
            borderWidth: isMissed ? 1.5 : 1
        )
        .padding(.horizontal)
        .onAppear {
            sessionStart = WorkoutSessionClock.startDate(dayKey: progressDayKey)
        }
        .onChange(of: completedExercises) { _, _ in
            // `markSetComplete` stamps the clock itself, so logging a set without tapping
            // Start still begins a session — pick that up so the timer appears.
            if sessionStart == nil {
                sessionStart = WorkoutSessionClock.startDate(dayKey: progressDayKey)
            }
        }
        .onChange(of: allExercisesComplete) { _, complete in
            // Only auto-present for a session happening today. Reviewing a past workout
            // and toggling its last set used to pop the celebration sheet.
            guard complete, isToday, !setsDisabled else { return }
            Task { @MainActor in
                finishWorkoutDay()
            }
        }
        .sheet(item: $summary) { WorkoutSummarySheet(summary: $0, massUnit: massUnit) }
    }

    // MARK: Session bar

    /// Explicit start and finish for a session.
    ///
    /// Before this, a workout had no beginning (start time was inferred from the first
    /// completed set, and elapsed time was never shown while training) and an accidental
    /// end (an `onChange` watching all-exercises-complete, which also fired when reviewing
    /// a past day and toggling its last set).
    @ViewBuilder
    private var sessionBar: some View {
        HStack(spacing: 8) {
            if setsDisabled {
                Text("Future workouts can't be logged yet")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else if sessionStart == nil && !allExercisesComplete {
                Button {
                    startSession()
                } label: {
                    Label("Start workout", systemImage: "play.fill")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .tint(Color.appAccent)
            } else {
                if let sessionStart {
                    // A live clock is the difference between "logging sets" and "in a session".
                    Label {
                        Text(sessionStart, style: .timer)
                            .font(.caption.weight(.semibold))
                            .monospacedDigit()
                    } icon: {
                        Image(systemName: "stopwatch")
                    }
                    .font(.caption)
                    .foregroundStyle(Color.appAccent)
                    .accessibilityLabel("Session elapsed time")
                }

                Button {
                    finishWorkoutDay(userInitiated: true)
                } label: {
                    Label("Finish", systemImage: "flag.checkered")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .tint(Color.appSuccess)
            }

            Spacer(minLength: 0)

            Menu {
                Button {
                    let willClear = allExercisesComplete
                    withAnimation {
                        workoutService.setDayCompletion(
                            day: day,
                            dayKey: progressDayKey,
                            planIndex: planIndex,
                            planId: planId,
                            complete: !allExercisesComplete
                        )
                    }
                    if willClear { Haptics.impact(.soft) }
                } label: {
                    Label(
                        allExercisesComplete ? "Clear completion" : "Mark all complete",
                        systemImage: allExercisesComplete ? "arrow.uturn.backward" : "checkmark.circle"
                    )
                }
                .disabled(setsDisabled)

                if sessionStart != nil {
                    Button(role: .destructive) {
                        WorkoutSessionClock.clear(dayKey: progressDayKey)
                        sessionStart = nil
                    } label: {
                        Label("Discard session timer", systemImage: "stopwatch.fill")
                    }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Session options")
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    private func startSession() {
        WorkoutSessionClock.markStartedIfNeeded(dayKey: progressDayKey)
        sessionStart = WorkoutSessionClock.startDate(dayKey: progressDayKey)
        Haptics.impact(.light)
    }

    /// Builds the session summary, exports the workout to Apple Health, and presents the recap.
    ///
    /// `userInitiated` distinguishes tapping Finish from every exercise happening to be
    /// ticked. A user finishing early keeps whatever they logged; the auto path still
    /// only fires for today's session.
    private func finishWorkoutDay(userInitiated: Bool = false) {
        Haptics.success()
        let logs = WorkoutSetLogStorage.logs(planId: planId, dayLabel: day.day, date: progressDayKey)
        let volume = logs.reduce(0.0) { $0 + ($1.weightLbs ?? 0) * Double($1.reps ?? 0) }
        let start = WorkoutSessionClock.startDate(dayKey: progressDayKey)

        // Nothing logged and nothing ticked — finishing would present an empty recap.
        if userInitiated, logs.isEmpty, completedExercises == 0 {
            ToastCenter.show("Log at least one set to finish this workout", type: .info)
            return
        }

        summary = WorkoutDaySummary(
            dayLabel: day.day,
            focus: day.focus,
            exercisesCompleted: completedExercises,
            totalExercises: totalExercises,
            setsLogged: logs.count,
            totalVolumeLbs: volume,
            duration: start.map { Date.now.timeIntervalSince($0) }
        )
        if let start {
            Task { await HealthKitWriter.saveWorkout(focus: day.focus, start: start, end: .now) }
        }
        WorkoutSessionClock.clear(dayKey: progressDayKey)
        sessionStart = nil
    }

    // MARK: Exercise section

    private func exerciseSection(
        _ title: String,
        exercises: [WorkoutExercise],
        color: Color,
        sectionKey: String,
        baseGlobalSlot: Int
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
                .padding(.horizontal)
                .padding(.top, 10)
                .padding(.bottom, 4)

            ForEach(Array(exercises.enumerated()), id: \.offset) { j, exercise in
                let globalSlot = baseGlobalSlot + j
                let webCtx = WorkoutSetProgressContext(
                    planId: planId,
                    planIndex: planIndex,
                    globalSlot: globalSlot,
                    section: sectionKey,
                    workoutDay: day,
                    progressDayKey: progressDayKey
                )
                ExerciseRow(
                    exercise: exercise,
                    workoutService: workoutService,
                    progressDayKey: progressDayKey,
                    planIndex: planIndex,
                    globalSlot: globalSlot,
                    webContext: webCtx,
                    setsDisabled: setsDisabled,
                    prescription: sectionKey == "warmup"
                        ? nil
                        : prescriptions[exercise.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()],
                    massUnit: massUnit,
                    gifData: gifData["\(globalSlot)-\(exercise.name)"],
                    onLoadGif: { await loadGif(slotTag: "\(globalSlot)-\(exercise.name)", searchName: exercise.name) },
                    onStartRestTimer: onStartRestTimer,
                    onCancelRestTimer: onCancelRestTimer
                )
                .id("\(progressDayKey)-\(sectionKey)-\(globalSlot)-\(exercise.name)")
            }
        }
    }

    private func loadGif(slotTag: String, searchName: String) async {
        // One attempt per slot: a recorded error means the demo is unavailable,
        // so rows scrolling back into view don't re-fetch it.
        guard gifData[slotTag] == nil, !loadingGifs.contains(slotTag), gifErrors[slotTag] == nil else { return }
        loadingGifs.insert(slotTag)
        defer { loadingGifs.remove(slotTag) }
        do {
            let results = try await workoutService.searchExercises(name: searchName)
            guard let urlString = results.first?.gifUrl, let url = URL(string: urlString) else {
                gifErrors[slotTag] = "Demo unavailable for this exercise."
                return
            }

            var lastError: Error?
            for _ in 0..<2 {
                do {
                    let data = try await APIClient.shared.requestRawURL(url)
                    if isLikelyImagePayload(data) {
                        gifData[slotTag] = data
                        return
                    }
                } catch {
                    lastError = error
                }
            }

            if lastError != nil {
                gifErrors[slotTag] = "Could not load demo animation."
            } else {
                gifErrors[slotTag] = "Demo unavailable for this exercise."
            }
        } catch {
            gifErrors[slotTag] = "Could not find exercise demo."
        }
    }

    private func isLikelyImagePayload(_ data: Data) -> Bool {
        guard !data.isEmpty else { return false }
        // GIF87a / GIF89a
        if data.count >= 6, let sig = String(data: data.prefix(6), encoding: .ascii),
           sig == "GIF87a" || sig == "GIF89a" {
            return true
        }
        // PNG header
        if data.count >= 8, Array(data.prefix(8)) == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
            return true
        }
        // JPEG header
        if data.count >= 2, data[data.startIndex] == 0xFF, data[data.index(after: data.startIndex)] == 0xD8 {
            return true
        }
        // The proxy signals "no demo" with an SVG placeholder instead of a 404 —
        // treat it as unavailable so the play button stays hidden.
        return false
    }

    // MARK: Music section

    @ViewBuilder
    private var musicSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                if showMusic {
                    withAnimation { showMusic = false }
                } else {
                    Task { await fetchMusic() }
                }
            } label: {
                HStack(spacing: 6) {
                    if isLoadingMusic {
                        ProgressView().scaleEffect(0.75)
                    } else {
                        Image(systemName: showMusic ? "music.note.list" : "music.note")
                            .foregroundStyle(Color.appSlate)
                    }
                    Text(showMusic ? "Hide Playlists" : "Workout Music")
                        .font(.caption.weight(.medium))
                }
            }
            .buttonStyle(.bordered)
            .tint(Color.appSlate)
            .controlSize(.small)
            .padding(.horizontal)
            .padding(.top, 6)
            .disabled(isLoadingMusic)

            if let musicError {
                Text(musicError)
                    .font(.caption)
                    .foregroundStyle(Color.appError)
                    .padding(.horizontal)
            } else if showMusic && !musicSuggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(musicSuggestions) { suggestion in
                            PlaylistPill(suggestion: suggestion)
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
    }

    private func fetchMusic() async {
        isLoadingMusic = true
        musicError = nil
        do {
            let response: MusicSuggestResponse = try await APIClient.shared.request(
                MusicAPI.suggest(workoutFocus: day.focus, provider: nil)
            )
            musicSuggestions = response.suggestions
            withAnimation { showMusic = true }
        } catch {
            musicError = error.localizedDescription
        }
        isLoadingMusic = false
    }
}

// MARK: - Exercise Row

/// One set's user-entered performance. Weight is held as text so a half-typed
/// "12." doesn't collapse to a number mid-edit.
struct SetInput: Identifiable, Equatable {
    let id = UUID()
    var weightText: String = ""
    var repsText: String = ""
    /// Rating of perceived exertion (6–10). Nil until rated.
    var rpe: Double?

    var weight: Double? {
        let normalized = weightText.replacingOccurrences(of: ",", with: ".")
        guard let value = Double(normalized), value > 0 else { return nil }
        return value
    }

    var reps: Int? {
        guard let value = Int(repsText.trimmingCharacters(in: .whitespaces)), value > 0 else { return nil }
        return value
    }
}

struct ExerciseRow: View {
    let exercise: WorkoutExercise
    let workoutService: WorkoutService
    let progressDayKey: String
    let planIndex: Int
    let globalSlot: Int
    let webContext: WorkoutSetProgressContext
    var setsDisabled: Bool = false
    /// Computed next-session target from the progression engine; nil for warmups/untracked lifts.
    var prescription: Progression.SetPrescription? = nil
    /// The unit the lifter types in. Storage stays in pounds regardless.
    var massUnit: MassUnit = .pounds
    let gifData: Data?
    let onLoadGif: () async -> Void
    var onStartRestTimer: ((String, Int) -> Void)? = nil
    var onCancelRestTimer: (() -> Void)? = nil

    @State private var showGif = false
    /// One entry per set — this is what makes drop sets, top-set-plus-backoffs and
    /// rep-outs recordable, and what stops the progression engine being fed N
    /// identical rows synthesised from a single weight field.
    @State private var sets: [SetInput] = []
    @State private var didPrefill = false

    private var prescribedSetCount: Int { exercise.effectiveSetCount }

    /// Representative rep count parsed from the prescription (first integer in e.g. "8-12").
    private var prescribedReps: Int? {
        let leading = exercise.reps.drop { !$0.isNumber }.prefix { $0.isNumber }
        return Int(leading)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header

            // Computed target for today, derived from logged history.
            ProgressionTargetView(prescription: prescription)

            if setsDisabled {
                futureDayNotice
            } else {
                setsTable
            }

            // GIF display — WKWebView so animated GIFs play correctly
            if showGif, let data = gifData {
                AnimatedGIFView(data: data)
                    .frame(height: 220)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .task { await onLoadGif() }
        .onAppear(perform: prefillIfNeeded)

        Divider().padding(.leading)
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(exercise.name)
                    .font(.subheadline)
                Text("\(exercise.sets) × \(exercise.reps)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let restLabel = exercise.restDisplayLabel {
                    Text("\(restLabel) rest")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(Color.appSlate)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.appSlate.opacity(0.12), in: Capsule())
                } else if let notes = exercise.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer()
            // GIF demo toggle — only rendered once the demo has actually loaded,
            // so exercises without an available demo never show a play button.
            if gifData != nil {
                Button {
                    withAnimation(.spring(duration: 0.25)) { showGif.toggle() }
                } label: {
                    Image(systemName: showGif ? "eye.slash.fill" : "play.circle.fill")
                        .font(.title2)
                        .foregroundStyle(showGif ? Color.secondary : Color.appAccent)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(showGif ? "Hide exercise demo" : "Show exercise demo")
            }
        }
    }

    private var futureDayNotice: some View {
        Text("Future workouts can't be logged yet.")
            .font(.caption2)
            .foregroundStyle(.secondary)
    }

    // MARK: Sets

    private var setsTable: some View {
        VStack(spacing: 6) {
            columnHeadings

            ForEach(Array(sets.enumerated()), id: \.element.id) { index, _ in
                setRow(index: index)
            }

            HStack(spacing: 12) {
                Button {
                    withAnimation(.snappy(duration: 0.2)) { addSet() }
                } label: {
                    Label("Add set", systemImage: "plus.circle")
                        .font(.caption.weight(.medium))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.appAccent)

                if sets.count > prescribedSetCount {
                    Button(role: .destructive) {
                        withAnimation(.snappy(duration: 0.2)) { removeLastSet() }
                    } label: {
                        Label("Remove set", systemImage: "minus.circle")
                            .font(.caption.weight(.medium))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.appError)
                }

                Spacer()
            }
            .padding(.top, 2)
            .frame(minHeight: 44)
        }
        // Five numeric columns can't survive the top of the accessibility range. Clamping
        // keeps the grid usable while still honouring most of the scale; VoiceOver users
        // get the per-set labels regardless of visual size.
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
    }

    private var columnHeadings: some View {
        HStack(spacing: 8) {
            Text("SET")
                .frame(width: 30, alignment: .leading)
            Text(massUnit.label.uppercased())
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("REPS")
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("RPE")
                .frame(width: 52, alignment: .leading)
            Spacer().frame(width: 44)
        }
        .font(.system(size: 9, weight: .semibold))
        .tracking(0.6)
        .foregroundStyle(.tertiary)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func setRow(index: Int) -> some View {
        let done = isSetComplete(index)

        HStack(spacing: 8) {
            Text("\(index + 1)")
                .font(.caption.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(index >= prescribedSetCount ? Color.appAccent : .secondary)
                .frame(width: 30, alignment: .leading)
                .accessibilityLabel(
                    index >= prescribedSetCount ? "Extra set \(index + 1)" : "Set \(index + 1)"
                )

            numericField(
                text: binding(index, \.weightText),
                placeholder: "—",
                keyboard: .decimalPad,
                label: "Weight in \(massUnit.label) for set \(index + 1)",
                isDone: done
            )

            numericField(
                text: binding(index, \.repsText),
                placeholder: exercise.reps,
                keyboard: .numberPad,
                label: "Reps for set \(index + 1)",
                isDone: done
            )

            rpeMenu(index: index, done: done)

            completionToggle(index: index, done: done)
        }
    }

    private func numericField(
        text: Binding<String>,
        placeholder: String,
        keyboard: UIKeyboardType,
        label: String,
        isDone: Bool
    ) -> some View {
        TextField(placeholder, text: text)
            .keyboardType(keyboard)
            .multilineTextAlignment(.center)
            .font(.subheadline)
            .monospacedDigit()
            .frame(maxWidth: .infinity)
            .frame(minHeight: 36)
            .background(
                (isDone ? Color.appAccent.opacity(0.10) : Color.secondary.opacity(0.10)),
                in: RoundedRectangle(cornerRadius: 8)
            )
            .accessibilityLabel(label)
    }

    private func rpeMenu(index: Int, done: Bool) -> some View {
        Menu {
            Button("Not rated") { setRPE(index, nil) }
            ForEach(Array(stride(from: 10.0, through: 6.0, by: -0.5)), id: \.self) { value in
                Button(Self.rpeLabel(value)) { setRPE(index, value) }
            }
        } label: {
            Text(sets[safe: index]?.rpe.map { Self.rpeLabel($0) } ?? "—")
                .font(.caption.weight(.medium))
                .foregroundStyle(sets[safe: index]?.rpe == nil ? Color.secondary : Color.appAccent)
                .frame(width: 52)
                .frame(minHeight: 36)
                .background(Color.secondary.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
        }
        .accessibilityLabel("Rate of perceived exertion for set \(index + 1)")
        .accessibilityValue(sets[safe: index]?.rpe.map { Self.rpeLabel($0) } ?? "Not rated")
    }

    private func completionToggle(index: Int, done: Bool) -> some View {
        Button {
            toggleSet(index)
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(done ? Color.appAccent : Color.secondary.opacity(0.12))
                    .shadow(color: done ? Color.appAccent.opacity(0.3) : .clear, radius: 4, y: 2)
                Image(systemName: done ? "checkmark" : "circle")
                    .font(.caption.weight(.black))
                    .foregroundStyle(done ? .white : Color.secondary)
            }
            // 44pt is the Apple minimum touch target, and this is the control the user
            // taps most — mid-set, with sweaty hands.
            .frame(width: 44, height: 44)
            .scaleEffect(done ? 1.04 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: done)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Set \(index + 1)")
        .accessibilityValue(done ? "Completed" : "Not completed")
        .accessibilityAddTraits(done ? [.isSelected] : [])
    }

    // MARK: State helpers

    /// "8" rather than "8.0"; half-points stay as "8.5".
    static func rpeLabel(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }

    private func isSetComplete(_ index: Int) -> Bool {
        workoutService.isSetComplete(
            exerciseName: exercise.name,
            setIndex: index,
            dayKey: progressDayKey,
            planIndex: planIndex,
            globalSlot: globalSlot,
            webContext: webContext,
            exercise: exercise
        )
    }

    /// Binding onto one field of one set, safe against the row list shrinking underneath it.
    private func binding(_ index: Int, _ keyPath: WritableKeyPath<SetInput, String>) -> Binding<String> {
        Binding(
            get: { sets.indices.contains(index) ? sets[index][keyPath: keyPath] : "" },
            set: { newValue in
                guard sets.indices.contains(index) else { return }
                sets[index][keyPath: keyPath] = newValue
            }
        )
    }

    private func setRPE(_ index: Int, _ value: Double?) {
        guard sets.indices.contains(index) else { return }
        sets[index].rpe = value
        // Keep an already-logged set in sync so a rating added after the checkmark
        // still reaches the progression engine.
        relogIfComplete(index)
    }

    private func addSet() {
        // A new set repeats the previous one — the common case is another set at the
        // same load, and it stays editable either way.
        let previous = sets.last
        sets.append(
            SetInput(
                weightText: previous?.weightText ?? "",
                repsText: previous?.repsText ?? "",
                rpe: nil
            )
        )
    }

    private func removeLastSet() {
        guard sets.count > prescribedSetCount, let index = sets.indices.last else { return }
        if isSetComplete(index) {
            workoutService.unmarkSetComplete(
                exerciseName: exercise.name,
                setIndex: index,
                dayKey: progressDayKey,
                planIndex: planIndex,
                globalSlot: globalSlot,
                webContext: webContext,
                exerciseForWeb: exercise
            )
        }
        sets.removeLast()
    }

    private func toggleSet(_ index: Int) {
        guard !setsDisabled, sets.indices.contains(index) else { return }
        hideKeyboard()

        if isSetComplete(index) {
            workoutService.unmarkSetComplete(
                exerciseName: exercise.name,
                setIndex: index,
                dayKey: progressDayKey,
                planIndex: planIndex,
                globalSlot: globalSlot,
                webContext: webContext,
                exerciseForWeb: exercise
            )
            Haptics.impact(.soft)
            onCancelRestTimer?()
            return
        }

        logSet(index)
        Haptics.impact(.light)
        celebratePRIfEarned(index)
        onStartRestTimer?(exercise.name, exercise.restSeconds)
    }

    /// Writes this set's own weight/reps/RPE. Weight is converted to pounds because
    /// every downstream consumer (progression, PRs, sync) stores pounds.
    private func logSet(_ index: Int) {
        guard let input = sets[safe: index] else { return }
        workoutService.markSetComplete(
            exerciseName: exercise.name,
            setIndex: index,
            dayKey: progressDayKey,
            planIndex: planIndex,
            globalSlot: globalSlot,
            webContext: webContext,
            exerciseForWeb: exercise,
            weightLbs: input.weight.map { massUnit.toPounds($0) },
            reps: input.reps ?? prescribedReps,
            rpe: input.rpe
        )
    }

    /// Re-writes an already-completed set after an RPE change so the rating isn't lost.
    private func relogIfComplete(_ index: Int) {
        guard isSetComplete(index) else { return }
        logSet(index)
    }

    /// Restores what was already logged for this day, falling back to the last session's
    /// matching set, then to the prescription.
    private func prefillIfNeeded() {
        guard !didPrefill else { return }
        didPrefill = true

        let existing = WorkoutSetLogStorage.logs(
            planId: webContext.planId,
            date: progressDayKey,
            dayLabel: webContext.workoutDay.day,
            section: webContext.section,
            exerciseName: exercise.name,
            globalSlot: globalSlot
        )
        let lastSession = WorkoutSetLogStorage.lastSessionSets(forExercise: exercise.name)

        // Extra sets logged earlier in the session must survive a card collapse.
        let highestLoggedIndex = existing.keys.max() ?? -1
        let count = max(prescribedSetCount, highestLoggedIndex + 1)

        sets = (0..<max(count, 1)).map { index in
            if let logged = existing[index] {
                return SetInput(
                    weightText: logged.weightLbs.map { massUnit.display(fromPounds: $0) } ?? "",
                    repsText: logged.reps.map(String.init) ?? "",
                    rpe: logged.rpe
                )
            }
            let previous = lastSession[index]
            return SetInput(
                weightText: previous?.weightLbs.map { massUnit.display(fromPounds: $0) } ?? "",
                repsText: previous?.reps.map(String.init) ?? "",
                rpe: nil
            )
        }
    }

    /// Records the just-completed set against the user's PRs and celebrates a new best.
    private func celebratePRIfEarned(_ index: Int) {
        guard let input = sets[safe: index],
              let weight = input.weight,
              let reps = input.reps ?? prescribedReps,
              reps > 0
        else { return }
        let weightLbs = massUnit.toPounds(weight)
        if PersonalRecordStore.record(exerciseName: exercise.name, weightLbs: weightLbs, reps: reps) {
            ToastCenter.celebrate()
            ToastCenter.show("New PR: \(exercise.name)! 🏆", type: .success)
        }
    }
}

private extension Array {
    /// Index-safe read — set rows are rebuilt on prescription changes, so an index can
    /// briefly outlive its element.
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

// MARK: - Rest Timer

struct RestTimerState: Equatable {
    var exerciseName: String
    var endDate: Date
    var totalSeconds: Int

    mutating func extend(by seconds: Int) {
        endDate = endDate.addingTimeInterval(TimeInterval(seconds))
        totalSeconds += seconds
    }
}

struct RestTimerBanner: View {
    let state: RestTimerState
    let onSkip: () -> Void
    let onAdd15: () -> Void
    let onFinished: () -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = max(0, Int(ceil(state.endDate.timeIntervalSince(context.date))))
            if remaining > 0 {
                VStack(spacing: 10) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Rest")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Text(state.exerciseName)
                                .font(.subheadline.weight(.medium))
                                .lineLimit(1)
                        }
                        Spacer()
                        Text(formatCountdown(remaining))
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Color.appAccent)
                            .contentTransition(.numericText())
                    }

                    GeometryReader { geo in
                        let progress = Double(remaining) / Double(max(1, state.totalSeconds))
                        Capsule()
                            .fill(Color.secondary.opacity(0.15))
                            .overlay(alignment: .leading) {
                                Capsule()
                                    .fill(Color.appAccent)
                                    .frame(width: geo.size.width * progress)
                            }
                    }
                    .frame(height: 6)

                    HStack(spacing: 10) {
                        Button("Skip", action: onSkip)
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        Button("+15s", action: onAdd15)
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        Spacer()
                    }
                }
                .padding()
                .cardSurface(cornerRadius: 16)
                .shadow(color: .black.opacity(0.12), radius: 8, y: 4)
            } else {
                Color.clear
                    .onAppear { onFinished() }
            }
        }
    }

    private func formatCountdown(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return m > 0 ? String(format: "%d:%02d", m, s) : "\(s)s"
    }
}

// MARK: - Playlist Pill

struct WorkoutDaySummary: Identifiable {
    let id = UUID()
    let dayLabel: String
    let focus: String
    let exercisesCompleted: Int
    let totalExercises: Int
    let setsLogged: Int
    let totalVolumeLbs: Double
    let duration: TimeInterval?
}

struct WorkoutSummarySheet: View {
    let summary: WorkoutDaySummary
    /// Volume is accumulated in pounds; display follows the lifter's chosen unit.
    var massUnit: MassUnit = .pounds
    @Environment(\.dismiss) private var dismiss
    @State private var showConfetti = false

    private var durationText: String? {
        guard let d = summary.duration, d > 0 else { return nil }
        let minutes = Int((d / 60).rounded())
        if minutes < 60 { return "\(minutes) min" }
        return "\(minutes / 60)h \(minutes % 60)m"
    }

    private var volumeText: String? {
        guard summary.totalVolumeLbs > 0 else { return nil }
        let converted = massUnit.fromPounds(summary.totalVolumeLbs)
        return "\(Int(converted.rounded())) \(massUnit.label)"
    }

    private var shareText: String {
        var parts = ["\(summary.dayLabel) — \(summary.focus)"]
        parts.append("\(summary.exercisesCompleted)/\(summary.totalExercises) exercises · \(summary.setsLogged) sets")
        if let volumeText { parts.append("\(volumeText) total volume") }
        if let durationText { parts.append("in \(durationText)") }
        parts.append("Tracked with Refactor")
        return parts.joined(separator: "\n")
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(spacing: 10) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(LinearGradient.appAccentGradient)
                        .accessibilityHidden(true)
                    Text("Workout Complete")
                        .font(.title2.weight(.bold))
                    Text("\(summary.dayLabel) · \(summary.focus)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 12)

                LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 12) {
                    statTile("Exercises", "\(summary.exercisesCompleted)/\(summary.totalExercises)", "dumbbell.fill")
                    statTile("Sets logged", "\(summary.setsLogged)", "checklist")
                    if let volumeText {
                        statTile("Volume", volumeText, "scalemass.fill")
                    }
                    if let durationText {
                        statTile("Duration", durationText, "clock.fill")
                    }
                }

                Spacer()

                // The one thing in this app anyone would post. Hevy grew on exactly
                // this loop, and the recap was already being built — it just had no way out.
                ShareLink(item: shareText) {
                    Label("Share workout", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button {
                    dismiss()
                } label: {
                    Text("Done").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .overlay {
                if showConfetti {
                    ConfettiView().allowsHitTesting(false)
                }
            }
            .onAppear {
                showConfetti = true
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(2.2))
                    showConfetti = false
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func statTile(_ label: String, _ value: String, _ icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.appAccent)
            Text(value)
                .font(.title3.weight(.bold))
                .monospacedDigit()
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .cardSurface(cornerRadius: 14)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }
}

struct PlaylistPill: View {
    let suggestion: PlaylistSuggestion

    var body: some View {
        if let url = URL(string: suggestion.deepLink) {
            Link(destination: url) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        Image(systemName: "music.note")
                            .font(.caption2)
                        Text(suggestion.name)
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                    }
                    Text(suggestion.mood)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(suggestion.bpm + " BPM")
                        .font(.system(size: 9))
                        .foregroundStyle(Color.appSlate)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.appSlate.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.appSlate.opacity(0.2), lineWidth: 1))
            }
        }
    }
}

// MARK: - Workout Import Sheet

struct WorkoutImportSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Environment(\.syncEngine) private var syncEngine

    let plan: FitnessPlan

    private enum ImportTab: String, CaseIterable, Identifiable {
        case url = "URL"
        case pdf = "PDF"
        var id: String { rawValue }
    }

    @State private var importTab: ImportTab = .url
    @State private var urlText = ""
    @State private var pdfData: Data?
    @State private var pdfName: String?
    @State private var showPdfPicker = false
    @State private var isImporting = false
    @State private var importedResult: WorkoutImportResult?
    @State private var importError: String?
    @State private var mergeTargetIndex: Int? = nil

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Source", selection: $importTab) {
                        ForEach(ImportTab.allCases) { tab in
                            Text(tab.rawValue).tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: importTab) { _, _ in
                        importedResult = nil
                        importError = nil
                    }
                }

                if importTab == .url {
                    Section {
                        TextField("https://…", text: $urlText)
                            .keyboardType(.URL)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                        Button("Import from URL") {
                            Task { await importFromUrl() }
                        }
                        .disabled(urlText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isImporting)
                    } header: {
                        Text("Paste a URL from a fitness blog, program page, or YouTube description")
                    }
                } else {
                    Section {
                        Button(pdfName == nil ? "Choose PDF…" : "Change PDF") {
                            showPdfPicker = true
                        }
                        if let pdfName {
                            Text(pdfName)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Button("Extract from PDF") {
                            Task { await importFromPdf() }
                        }
                        .disabled(pdfData == nil || isImporting)
                    } header: {
                        Text("Upload a text-based workout program PDF")
                    }
                }

                if isImporting {
                    Section {
                        HStack {
                            ProgressView()
                            Text(importTab == .pdf ? "Extracting workout…" : "Fetching workout…")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                if let err = importError {
                    Section {
                        Text(err)
                            .font(.caption)
                            .foregroundStyle(Color.appError)
                    }
                }

                if let result = importedResult {
                    let programDays = result.days ?? [result.workout]
                    if result.isFullProgram {
                        Section("Program ready") {
                            if let title = result.programTitle {
                                Text(title).font(.subheadline)
                            }
                            Text("\(programDays.count) sessions — week 1 starts \(startLabel(for: programDays))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            ForEach(programDays.prefix(6).indices, id: \.self) { i in
                                let d = programDays[i]
                                Text("\(d.day) — \(d.focus) (\(d.exercises.count) exercises)")
                                    .font(.caption)
                            }
                            if programDays.count > 6 {
                                Text("…and \(programDays.count - 6) more").font(.caption).foregroundStyle(.secondary)
                            }
                            Button("Replace workout plan") {
                                replaceProgram(programDays)
                            }
                            .foregroundStyle(Color.appAccent)
                        }
                    } else {
                        let day = result.workout
                        Section("Imported: \(day.day)") {
                            LabeledContent("Focus", value: day.focus)
                            LabeledContent("Exercises", value: "\(day.exercises.count)")
                            ForEach(day.exercises) { ex in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(ex.name).font(.subheadline)
                                    Text("\(ex.sets) × \(ex.reps)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }

                        Section("Add to plan") {
                            Button("Add as new workout day") {
                                addAsNewDay(day)
                            }
                            .foregroundStyle(Color.appAccent)

                            if !plan.workoutPlan.weeklyPlan.isEmpty {
                                Picker("Merge into existing day", selection: $mergeTargetIndex) {
                                    Text("Select day").tag(Optional<Int>.none)
                                    ForEach(plan.workoutPlan.weeklyPlan.indices, id: \.self) { i in
                                        Text(plan.workoutPlan.weeklyPlan[i].day).tag(Optional(i))
                                    }
                                }
                                if let idx = mergeTargetIndex {
                                    Button("Merge into \(plan.workoutPlan.weeklyPlan[idx].day)") {
                                        mergeIntoDay(day, targetIndex: idx)
                                    }
                                    .foregroundStyle(Color.appAccent)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Import Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { hideKeyboard() }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .fileImporter(
                isPresented: $showPdfPicker,
                allowedContentTypes: [.pdf],
                allowsMultipleSelection: false
            ) { result in
                switch result {
                case .success(let urls):
                    guard let url = urls.first else { return }
                    guard url.startAccessingSecurityScopedResource() else {
                        importError = "Could not access PDF file"
                        return
                    }
                    defer { url.stopAccessingSecurityScopedResource() }
                    do {
                        pdfData = try Data(contentsOf: url)
                        pdfName = url.lastPathComponent
                        importedResult = nil
                        importError = nil
                    } catch {
                        importError = error.localizedDescription
                    }
                case .failure(let error):
                    importError = error.localizedDescription
                }
            }
        }
    }

    private func importFromUrl() async {
        importError = nil
        importedResult = nil
        isImporting = true
        defer { isImporting = false }
        do {
            importedResult = try await WorkoutService.shared.parseWorkoutImport(
                urlText.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            mergeTargetIndex = nil
        } catch {
            importError = error.localizedDescription
        }
    }

    private func importFromPdf() async {
        guard let pdfData else { return }
        importError = nil
        importedResult = nil
        isImporting = true
        defer { isImporting = false }
        do {
            importedResult = try await WorkoutService.shared.parseWorkoutPdf(
                pdfData,
                fileName: pdfName ?? "workout.pdf"
            )
            mergeTargetIndex = nil
        } catch {
            importError = error.localizedDescription
        }
    }

    private func startLabel(for days: [WorkoutDay]) -> String {
        let anchor = WorkoutImportStart.inferFirstSessionDate(weeklyPlan: days)
        guard let date = DateHelpers.date(from: anchor) else { return anchor }
        return date.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
    }

    private func replaceProgram(_ days: [WorkoutDay]) {
        plan.workoutPlan = WorkoutImportStart.workoutPlanAfterImport(
            weeklyPlan: days,
            preserving: plan.workoutPlan
        )
        try? modelContext.save()
        Task { await syncEngine?.markDirty() }
        dismiss()
    }

    private func addAsNewDay(_ day: WorkoutDay) {
        var weekly = plan.workoutPlan.weeklyPlan
        weekly.append(day)
        savePlan(weekly: weekly)
    }

    private func mergeIntoDay(_ day: WorkoutDay, targetIndex: Int) {
        var weekly = plan.workoutPlan.weeklyPlan
        guard targetIndex < weekly.count else { return }
        let existing = weekly[targetIndex]
        weekly[targetIndex] = WorkoutDay(
            day: existing.day,
            focus: existing.focus,
            warmups: existing.warmups,
            exercises: existing.exercises + day.exercises,
            finishers: existing.finishers
        )
        savePlan(weekly: weekly)
    }

    private func savePlan(weekly: [WorkoutDay]) {
        plan.workoutPlan = WorkoutPlan(
            weeklyPlan: weekly,
            tips: plan.workoutPlan.tips,
            programWeek1Start: plan.workoutPlan.programWeek1Start,
            advancementMode: plan.workoutPlan.advancementMode,
            programWeekOffset: plan.workoutPlan.programWeekOffset,
            pausedUntil: plan.workoutPlan.pausedUntil,
            missedSessions: plan.workoutPlan.missedSessions,
            catchUpBannerDismissedAt: plan.workoutPlan.catchUpBannerDismissedAt
        )
        try? modelContext.save()
        Task { await syncEngine?.markDirty() }
        dismiss()
    }
}
