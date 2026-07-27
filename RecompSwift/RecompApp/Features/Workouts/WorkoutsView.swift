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

    @Query(sort: \FitnessPlan.createdAt, order: .reverse)
    private var allPlans: [FitnessPlan]

    @Query(sort: \BiofeedbackEntry.time, order: .reverse)
    private var biofeedbackEntries: [BiofeedbackEntry]

    private var currentPlan: FitnessPlan? { allPlans.first }

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
                                subtitle: "Generate a plan from the Adjust tab to see your weekly workouts"
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
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(levelColor.opacity(0.3), lineWidth: 1)
        )
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
    var onEdit: (() -> Void)? = nil
    var onStartRestTimer: ((String, Int) -> Void)? = nil
    var onCancelRestTimer: (() -> Void)? = nil

    @State private var isExpanded: Bool
    @State private var gifData: [String: Data] = [:]
    @State private var loadingGifs: Set<String> = []
    @State private var gifErrors: [String: String] = [:]
    @State private var summary: WorkoutDaySummary?
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
        self.onEdit = onEdit
        self.onStartRestTimer = onStartRestTimer
        self.onCancelRestTimer = onCancelRestTimer
        _isExpanded = State(initialValue: isToday || isMissed)
    }

    private var allExercisesComplete: Bool {
        totalExercises > 0 && completedExercises == totalExercises
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
                        HStack(spacing: 8) {
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
                                Text(allExercisesComplete ? "Clear completion" : "Mark all complete")
                                    .font(.caption.weight(.medium))
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .disabled(setsDisabled)
                            .padding(.horizontal)
                            .padding(.top, 8)

                            if setsDisabled {
                                Text("Future workouts can't be marked complete")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
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
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            if isMissed {
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(Color.appWarm.opacity(0.45), lineWidth: 1.5)
            }
        }
        .padding(.horizontal)
        .onChange(of: allExercisesComplete) { _, complete in
            // Fires when the final set (or "Mark all complete") tips the day over.
            // onChange never fires on initial render, so re-opening a done day stays quiet.
            if complete { finishWorkoutDay() }
        }
        .sheet(item: $summary) { WorkoutSummarySheet(summary: $0) }
    }

    /// Builds the session summary, exports the workout to Apple Health, and presents the recap.
    private func finishWorkoutDay() {
        Haptics.success()
        let logs = WorkoutSetLogStorage.logs(planId: planId, dayLabel: day.day, date: progressDayKey)
        let volume = logs.reduce(0.0) { $0 + ($1.weightLbs ?? 0) * Double($1.reps ?? 0) }
        let start = WorkoutSessionClock.startDate(dayKey: progressDayKey)
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
                    gifData: gifData["\(globalSlot)-\(exercise.name)"],
                    onLoadGif: { await loadGif(slotTag: "\(globalSlot)-\(exercise.name)", searchName: exercise.name) },
                    onStartRestTimer: onStartRestTimer,
                    onCancelRestTimer: onCancelRestTimer
                )
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

struct ExerciseRow: View {
    let exercise: WorkoutExercise
    let workoutService: WorkoutService
    let progressDayKey: String
    let planIndex: Int
    let globalSlot: Int
    let webContext: WorkoutSetProgressContext
    var setsDisabled: Bool = false
    let gifData: Data?
    let onLoadGif: () async -> Void
    var onStartRestTimer: ((String, Int) -> Void)? = nil
    var onCancelRestTimer: (() -> Void)? = nil

    @State private var showGif = false
    @State private var weightText = ""
    @FocusState private var weightFocused: Bool

    private var numSets: Int { exercise.effectiveSetCount }

    /// Working weight the user typed for this exercise, if any.
    private var enteredWeight: Double? {
        let normalized = weightText.replacingOccurrences(of: ",", with: ".")
        guard let value = Double(normalized), value > 0 else { return nil }
        return value
    }

    /// Representative rep count parsed from the prescription (first integer in e.g. "8-12").
    private var prescribedReps: Int? {
        let leading = exercise.reps.drop { !$0.isNumber }.prefix { $0.isNumber }
        return Int(leading)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
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
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(showGif ? "Hide exercise demo" : "Show exercise demo")
                }
            }

            // Working-weight input — feeds set logs, PR detection, and the post-workout summary.
            if !setsDisabled {
                HStack(spacing: 6) {
                    Image(systemName: "scalemass")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Weight", text: $weightText)
                        .keyboardType(.decimalPad)
                        .focused($weightFocused)
                        .multilineTextAlignment(.center)
                        .frame(width: 60)
                        .padding(.vertical, 4)
                        .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                    Text("lbs")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Working weight in pounds for \(exercise.name)")
            }

            // Set completion checkboxes — horizontal scroll so many sets stay one row (no wrap / “calendar” illusion).
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(0..<numSets, id: \.self) { setIdx in
                        let done = workoutService.isSetComplete(
                            exerciseName: exercise.name,
                            setIndex: setIdx,
                            dayKey: progressDayKey,
                            planIndex: planIndex,
                            globalSlot: globalSlot,
                            webContext: webContext,
                            exercise: exercise
                        )
                        Button {
                            guard !setsDisabled else { return }
                            weightFocused = false
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
                                if done {
                                    workoutService.unmarkSetComplete(
                                        exerciseName: exercise.name,
                                        setIndex: setIdx,
                                        dayKey: progressDayKey,
                                        planIndex: planIndex,
                                        globalSlot: globalSlot,
                                        webContext: webContext,
                                        exerciseForWeb: exercise
                                    )
                                    Haptics.impact(.soft)
                                    onCancelRestTimer?()
                                } else {
                                    workoutService.markSetComplete(
                                        exerciseName: exercise.name,
                                        setIndex: setIdx,
                                        dayKey: progressDayKey,
                                        planIndex: planIndex,
                                        globalSlot: globalSlot,
                                        webContext: webContext,
                                        exerciseForWeb: exercise,
                                        weightLbs: enteredWeight,
                                        reps: prescribedReps
                                    )
                                    Haptics.impact(.light)
                                    celebratePRIfEarned()
                                    if setIdx < numSets - 1 {
                                        onStartRestTimer?(exercise.name, exercise.restSeconds)
                                    }
                                }
                            }
                        } label: {
                            ZStack {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(done ? Color.appAccent : Color.secondary.opacity(0.12))
                                    .frame(width: 38, height: 38)
                                    .shadow(color: done ? Color.appAccent.opacity(0.3) : .clear, radius: 4, y: 2)
                                if done {
                                    Image(systemName: "checkmark")
                                        .font(.caption.weight(.black))
                                        .foregroundStyle(.white)
                                } else {
                                    Text("\(setIdx + 1)")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .scaleEffect(done ? 1.05 : 1.0)
                        }
                        .buttonStyle(.plain)
                        .disabled(setsDisabled)
                        .opacity(setsDisabled ? 0.45 : 1)
                        .accessibilityLabel("Set \(setIdx + 1)")
                        .accessibilityValue(done ? "Completed" : "Not completed")
                    }
                }
            }
            .frame(minHeight: 36)
            .allowsHitTesting(!setsDisabled)

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
        .onAppear {
            // Prefill with the last weight used for this lift so progressive overload is one tap.
            if weightText.isEmpty, let last = WorkoutSetLogStorage.lastWeight(forExercise: exercise.name) {
                weightText = last.truncatingRemainder(dividingBy: 1) == 0
                    ? "\(Int(last))"
                    : String(format: "%.1f", last)
            }
        }
        Divider().padding(.leading)
    }

    /// Records the just-completed set against the user's PRs and celebrates a new best.
    private func celebratePRIfEarned() {
        guard let weight = enteredWeight, let reps = prescribedReps, reps > 0 else { return }
        if PersonalRecordStore.record(exerciseName: exercise.name, weightLbs: weight, reps: reps) {
            ToastCenter.celebrate()
            ToastCenter.show("New PR: \(exercise.name)! 🏆", type: .success)
        }
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
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
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
        return "\(Int(summary.totalVolumeLbs.rounded())) lbs"
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
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
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
