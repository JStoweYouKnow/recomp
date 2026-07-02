import SwiftUI
import SwiftData
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

    @Query(sort: \FitnessPlan.createdAt, order: .reverse)
    private var allPlans: [FitnessPlan]

    @Query(sort: \BiofeedbackEntry.time, order: .reverse)
    private var biofeedbackEntries: [BiofeedbackEntry]

    private var currentPlan: FitnessPlan? { allPlans.first }

    private var todaysBiofeedback: BiofeedbackEntry? {
        biofeedbackEntries.first { $0.date == DateHelpers.todayString() }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                CalendarStripView(selectedDate: $selectedDate)
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .padding(.bottom, 4)

                ScrollView {
                    VStack(spacing: 16) {
                        recoverySection

                        if let plan = currentPlan {
                            CatchUpBannerView(
                                plan: plan,
                                progress: workoutService.webWorkoutProgressDictionaryForSync(),
                                planService: planService,
                                modelContext: context,
                                onSync: { NotificationCenter.default.post(name: .recompScheduleDataSync, object: nil) }
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

                            let items = WorkoutProgramSchedule.displayedPlanItems(plan: plan, selectedDate: selectedDate)
                            let todayKey = DateHelpers.todayString()
                            ForEach(items) { item in
                                let progressKey = WorkoutProgramSchedule.progressDayKey(
                                    for: item.day,
                                    weekContaining: selectedDate
                                )
                                WorkoutDayCard(
                                    planId: plan.id,
                                    day: item.day,
                                    workoutService: workoutService,
                                    progressDayKey: progressKey,
                                    planIndex: item.planIndex,
                                    isToday: progressKey == todayKey,
                                    recoveryModifier: recoveryModifier(for: item.day),
                                    onEdit: {
                                        editRoute = WorkoutDayEditRoute(planIndex: item.planIndex)
                                    }
                                )
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
                    progress: workoutService.webWorkoutProgressDictionaryForSync()
                )
                try? context.save()
                NotificationCenter.default.post(name: .recompScheduleDataSync, object: nil)
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
    var recoveryModifier: Double? = nil
    var onEdit: (() -> Void)? = nil

    @State private var isExpanded: Bool
    @State private var gifData: [String: Data] = [:]
    @State private var loadingGifs: Set<String> = []
    @State private var gifErrors: [String: String] = [:]
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
        recoveryModifier: Double? = nil,
        onEdit: (() -> Void)? = nil
    ) {
        self.planId = planId
        self.day = day
        self.workoutService = workoutService
        self.progressDayKey = progressDayKey
        self.planIndex = planIndex
        self.isToday = isToday
        self.recoveryModifier = recoveryModifier
        self.onEdit = onEdit
        _isExpanded = State(initialValue: isToday)
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
                            Text(day.day)
                                .font(.headline)
                                .foregroundStyle(isToday ? Color.appAccent : Color.primary)
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
        .padding(.horizontal)
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
                    gifData: gifData["\(globalSlot)-\(exercise.name)"],
                    isLoadingGif: loadingGifs.contains("\(globalSlot)-\(exercise.name)"),
                    gifError: gifErrors["\(globalSlot)-\(exercise.name)"],
                    onLoadGif: { await loadGif(slotTag: "\(globalSlot)-\(exercise.name)", searchName: exercise.name) }
                )
            }
        }
    }

    private func loadGif(slotTag: String, searchName: String) async {
        guard gifData[slotTag] == nil, !loadingGifs.contains(slotTag) else { return }
        loadingGifs.insert(slotTag)
        gifErrors[slotTag] = nil
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
        // Proxy may intentionally return SVG placeholder.
        if let prefix = String(data: data.prefix(256), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
           prefix.hasPrefix("<svg") || prefix.hasPrefix("<?xml") {
            return true
        }
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
    let gifData: Data?
    let isLoadingGif: Bool
    let gifError: String?
    let onLoadGif: () async -> Void

    @State private var showGif = false

    private var numSets: Int { exercise.effectiveSetCount }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name)
                        .font(.subheadline)
                    Text("\(exercise.sets) × \(exercise.reps)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let notes = exercise.notes, !notes.isEmpty {
                        Text(notes)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
                Spacer()
                // GIF demo toggle
                Button {
                    if gifData != nil {
                        withAnimation(.spring(duration: 0.25)) { showGif.toggle() }
                    } else {
                        Task { await onLoadGif() }
                    }
                } label: {
                    ZStack {
                        if isLoadingGif {
                            ProgressView()
                                .scaleEffect(0.75)
                                .frame(width: 28, height: 28)
                        } else {
                            Image(systemName: showGif ? "eye.slash.fill" : "play.circle.fill")
                                .font(.title2)
                                .foregroundStyle(showGif ? Color.secondary : Color.appAccent)
                        }
                    }
                    .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(showGif ? "Hide exercise demo" : "Show exercise demo")
                .disabled(isLoadingGif)
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
                                } else {
                                    workoutService.markSetComplete(
                                        exerciseName: exercise.name,
                                        setIndex: setIdx,
                                        dayKey: progressDayKey,
                                        planIndex: planIndex,
                                        globalSlot: globalSlot,
                                        webContext: webContext,
                                        exerciseForWeb: exercise
                                    )
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
                        .accessibilityLabel("Set \(setIdx + 1)")
                        .accessibilityValue(done ? "Completed" : "Not completed")
                    }
                }
            }
            .frame(minHeight: 36)

            // GIF display — WKWebView so animated GIFs play correctly
            if showGif, let data = gifData {
                AnimatedGIFView(data: data)
                    .frame(height: 220)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
            if let gifError {
                Label(gifError, systemImage: "exclamationmark.triangle")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .onChange(of: gifData != nil) { _, hasData in
            if hasData {
                withAnimation(.easeIn(duration: 0.25)) { showGif = true }
            }
        }
        Divider().padding(.leading)
    }
}

// MARK: - Playlist Pill

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

    @State private var urlText = ""
    @State private var isImporting = false
    @State private var importedDay: WorkoutDay?
    @State private var importError: String?
    @State private var mergeTargetIndex: Int? = nil

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://…", text: $urlText)
                        .keyboardType(.URL)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                    Button("Import from URL") {
                        Task { await importWorkout() }
                    }
                    .disabled(urlText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isImporting)

                    if isImporting {
                        HStack {
                            ProgressView()
                            Text("Fetching workout…")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    if let err = importError {
                        Text(err)
                            .font(.caption)
                            .foregroundStyle(Color.appError)
                    }
                } header: {
                    Text("Paste a URL from a fitness blog, program page, or YouTube description")
                }

                if let day = importedDay {
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
        }
    }

    private func importWorkout() async {
        importError = nil
        importedDay = nil
        isImporting = true
        defer { isImporting = false }
        do {
            importedDay = try await WorkoutService.shared.parseWorkoutUrl(
                urlText.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            mergeTargetIndex = nil
        } catch {
            importError = error.localizedDescription
        }
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
            programWeek1Start: plan.workoutPlan.programWeek1Start
        )
        try? modelContext.save()
        Task { await syncEngine?.markDirty() }
        dismiss()
    }
}
