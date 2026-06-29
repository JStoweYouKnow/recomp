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

    @Query(sort: \BiofeedbackEntry.time, order: .reverse)
    private var biofeedbackEntries: [BiofeedbackEntry]

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

                        if let plan = planService.currentPlan(context: context) {
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
                                    recoveryModifier: recoveryModifier(for: item.day)
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
            }
            .navigationTitle("Workouts")
            .onAppear {
                if let plan = planService.currentPlan(context: context) {
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
                    Button {
                        withAnimation { workoutService.resetDayProgress(dayKey: DateHelpers.todayString()) }
                    } label: {
                        Image(systemName: "arrow.counterclockwise.circle")
                            .help("Reset today's progress")
                    }
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
        }
    }

    private func checkRecovery(_ bf: BiofeedbackEntry) async {
        isLoadingRecovery = true
        do {
            recoveryAssessment = try await workoutService.assessRecovery(biofeedback: [
                "energy": bf.energy,
                "mood": bf.mood,
                "hunger": bf.hunger,
                "stress": bf.stress,
                "soreness": bf.soreness
            ])
        } catch {}
        isLoadingRecovery = false
    }

    private func recoveryModifier(for day: WorkoutDay) -> Double? {
        recoveryAssessment?.modifiedWorkout?.volumeAdjustment
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
            }

            // Score bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(.gray.opacity(0.15))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(levelColor)
                        .frame(width: geo.size.width * assessment.score)
                }
            }
            .frame(height: 8)

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

    @State private var isExpanded: Bool
    @State private var gifURLs: [String: String] = [:]
    @State private var loadingGifs: Set<String> = []
    @State private var musicSuggestions: [PlaylistSuggestion] = []
    @State private var isLoadingMusic = false
    @State private var showMusic = false

    init(
        planId: String,
        day: WorkoutDay,
        workoutService: WorkoutService,
        progressDayKey: String,
        planIndex: Int,
        isToday: Bool = false,
        recoveryModifier: Double? = nil
    ) {
        self.planId = planId
        self.day = day
        self.workoutService = workoutService
        self.progressDayKey = progressDayKey
        self.planIndex = planIndex
        self.isToday = isToday
        self.recoveryModifier = recoveryModifier
        _isExpanded = State(initialValue: isToday)
    }

    /// Matches web planner header: completed / total **exercises** (rows), not sum of sets.
    private var totalExercises: Int { day.exerciseSlotCount }

    private var completedExercises: Int {
        workoutService.completedExerciseCount(for: day, dayKey: progressDayKey, planIndex: planIndex, planId: planId)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
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
                                .font(.caption.weight(.medium))
                                .foregroundStyle(completedExercises == totalExercises ? Color.appSuccess : Color.primary)
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
                    gifURL: gifURLs["\(globalSlot)-\(exercise.name)"],
                    isLoadingGif: loadingGifs.contains("\(globalSlot)-\(exercise.name)"),
                    onLoadGif: { await loadGif(slotTag: "\(globalSlot)-\(exercise.name)", searchName: exercise.name) }
                )
            }
        }
    }

    private func loadGif(slotTag: String, searchName: String) async {
        guard gifURLs[slotTag] == nil, !loadingGifs.contains(slotTag) else { return }
        loadingGifs.insert(slotTag)
        do {
            try await workoutService.searchExercises(name: searchName)
            if let url = workoutService.exerciseResults.first?.gifUrl {
                gifURLs[slotTag] = url
            }
        } catch {}
        loadingGifs.remove(slotTag)
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
                            .foregroundStyle(.pink)
                    }
                    Text(showMusic ? "Hide Playlists" : "Workout Music")
                        .font(.caption.weight(.medium))
                }
            }
            .buttonStyle(.bordered)
            .tint(.pink)
            .controlSize(.small)
            .padding(.horizontal)
            .padding(.top, 6)
            .disabled(isLoadingMusic)

            if showMusic && !musicSuggestions.isEmpty {
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
        do {
            let response: MusicSuggestResponse = try await APIClient.shared.request(
                MusicAPI.suggest(workoutFocus: day.focus, provider: nil)
            )
            musicSuggestions = response.suggestions
            withAnimation { showMusic = true }
        } catch {}
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
    let gifURL: String?
    let isLoadingGif: Bool
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
                    if gifURL != nil {
                        withAnimation { showGif.toggle() }
                    } else {
                        Task { await onLoadGif() }
                    }
                } label: {
                    if isLoadingGif {
                        ProgressView().scaleEffect(0.7)
                            .frame(width: 28)
                    } else {
                        Image(systemName: showGif ? "eye.slash" : "play.circle")
                            .font(.title3)
                            .foregroundStyle(Color.appAccent)
                    }
                }
                .buttonStyle(.plain)
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
                            withAnimation(.spring(duration: 0.2)) {
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
                        } label: {
                            ZStack {
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(done ? Color.appAccent : Color.secondary.opacity(0.15))
                                    .frame(width: 32, height: 32)
                                if done {
                                    Image(systemName: "checkmark")
                                        .font(.caption.weight(.bold))
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
            .frame(minHeight: 36)

            // GIF display — WKWebView so animated GIFs play correctly
            if showGif, let urlString = gifURL, let url = URL(string: urlString) {
                AnimatedGIFView(url: url)
                    .frame(height: 220)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
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
                        .foregroundStyle(.pink)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.pink.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(.pink.opacity(0.2), lineWidth: 1))
            }
        }
    }
}
