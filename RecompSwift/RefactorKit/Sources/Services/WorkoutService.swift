import Foundation
import Observation

/// Optional context so set completions can emit web-compatible `workoutProgress` keys for `/api/data/sync`.
public struct WorkoutSetProgressContext: Sendable {
    public let planId: String
    public let planIndex: Int
    public let globalSlot: Int
    /// `warmup`, `main`, or `finisher` (matches web `exerciseKey`).
    public let section: String
    public let workoutDay: WorkoutDay
    /// Calendar column `yyyy-MM-dd` for this session (same as card `progressDayKey`).
    public let progressDayKey: String

    public init(
        planId: String,
        planIndex: Int,
        globalSlot: Int,
        section: String,
        workoutDay: WorkoutDay,
        progressDayKey: String
    ) {
        self.planId = planId
        self.planIndex = planIndex
        self.globalSlot = globalSlot
        self.section = section
        self.workoutDay = workoutDay
        self.progressDayKey = progressDayKey
    }
}

@MainActor
@Observable
public final class WorkoutService {
    /// Shared instance so the dashboard coach and workouts tab read the same completion state.
    public static let shared = WorkoutService()

    public private(set) var exerciseResults: [ExerciseSearchResult] = []
    public private(set) var isSearching = false

    /// Per calendar day (`yyyy-MM-dd`), storage key → completed set ids (`set_0`, …).
    private var progressByDay: [String: [String: Set<String>]] = [:]

    /// Mirrors web `localStorage` / Dynamo `WORKOUT_PROGRESS` — keyed by `exerciseKey`, value ISO timestamp.
    private var webProgressMap: [String: String] = [:]

    private let api: APIClient
    private let defaultsKey = "recomp_workout_set_progress_v2"

    private struct ProgressRoot: Codable {
        var byDay: [String: [String: [String]]]
        var webProgress: [String: String]?
    }

    private let isoFull: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    public init(api: APIClient = .shared) {
        self.api = api
        loadFromDefaults()
    }

    // MARK: - Persistence

    private func loadFromDefaults() {
        let store = RecompAppGroupDefaults.shared
        let legacyKey = "recomp_workout_set_progress_v1"
        let keys = [defaultsKey, legacyKey]
        for key in keys {
            guard let data = store.data(forKey: key),
                  let root = try? JSONDecoder().decode(ProgressRoot.self, from: data) else { continue }
            progressByDay = root.byDay.mapValues { inner in
                inner.mapValues { Set($0) }
            }
            webProgressMap = root.webProgress ?? [:]
            if key == legacyKey {
                persistToDefaults()
                store.removeObject(forKey: legacyKey)
            }
            return
        }
        progressByDay = [:]
        webProgressMap = [:]
    }

    private func persistToDefaults() {
        let serializable = progressByDay.mapValues { inner in
            inner.mapValues { $0.sorted() }
        }
        let root = ProgressRoot(byDay: serializable, webProgress: webProgressMap.isEmpty ? nil : webProgressMap)
        if let data = try? JSONEncoder().encode(root) {
            RecompAppGroupDefaults.shared.set(data, forKey: defaultsKey)
        }
    }

    /// Clears all workout progress (in-memory + persisted). Call on logout / account switch
    /// so the next account on a shared device starts clean.
    public func reset() {
        progressByDay = [:]
        webProgressMap = [:]
        RecompAppGroupDefaults.shared.removeObject(forKey: defaultsKey)
    }

    private func postSyncNotification() {
        NotificationCenter.default.post(name: .recompScheduleDataSync, object: nil)
    }

    // MARK: - Server merge (pull)

    /// Merges server-confirmed completions into local per-set progress.
    /// Server data is additive only — it never clears local set checkmarks.
    /// This prevents in-progress sets from being wiped by a sync pull, regardless
    /// of how workout day labels map to calendar dates.
    public func replaceWebProgressFromServer(_ map: [String: String], plan: FitnessPlan?) {
        webProgressMap = map
        guard let plan else {
            persistToDefaults()
            return
        }

        for (key, iso) in map {
            guard let parsed = WorkoutWebProgress.parseKey(key, planId: plan.id),
                  let loc = WorkoutWebProgress.locateSlot(parsed: parsed, in: plan) else { continue }
            // Prefer deriving the local calendar date from the key's embedded weekStart so that
            // UTC timestamps from the web don't cause an off-by-one-day mismatch for users
            // who complete workouts in the evening in UTC-offset timezones.
            let utcDate = String(iso.prefix(10))
            let dayKey: String
            if let weekStart = parsed.weekStartMonday {
                dayKey = WorkoutWebProgress.calendarDayKey(
                    weekStartMonday: weekStart,
                    dayLabel: parsed.dayLabel,
                    fallbackUtcDate: utcDate
                )
            } else {
                dayKey = utcDate
            }
            let day = plan.workoutPlan.weeklyPlan[loc.planIndex]
            let slots = day.enumeratedExerciseSlots()
            guard let pair = slots.first(where: { $0.globalSlot == loc.globalSlot }) else { continue }
            let n = pair.exercise.effectiveSetCount
            let section = WorkoutWebProgress.sectionForExerciseSlot(day: day, globalSlot: loc.globalSlot)
            markAllSets(
                planId: plan.id,
                dayLabel: day.day,
                section: section,
                exercise: pair.exercise,
                globalSlot: loc.globalSlot,
                dayKey: dayKey,
                setCount: n
            )
        }

        persistToDefaults()
    }

    /// One-time migration from `slot:planIndex:globalSlot` keys (invalid after reordering/inserting days) to
    /// stable row keys. Call after a `FitnessPlan` is available (e.g. post-sync).
    public func migrateWorkoutRowProgressKeysIfNeeded(plan: FitnessPlan) {
        var sawSlotKey = false
        for inner in progressByDay.values where inner.keys.contains(where: { $0.hasPrefix("slot:") }) {
            sawSlotKey = true
            break
        }
        guard sawSlotKey else { return }

        var newByDay: [String: [String: Set<String>]] = [:]
        for (dayKey, dayMap) in progressByDay {
            var out: [String: Set<String>] = [:]
            for (key, sets) in dayMap {
                if key.hasPrefix("slot:"),
                   let parsed = parseLegacySlotStorageKey(key),
                   parsed.planIndex >= 0,
                   parsed.planIndex < plan.workoutPlan.weeklyPlan.count {
                    let day = plan.workoutPlan.weeklyPlan[parsed.planIndex]
                    let gs = parsed.globalSlot
                    guard let pair = day.enumeratedExerciseSlots().first(where: { $0.globalSlot == gs }) else {
                        out[key] = sets
                        continue
                    }
                    let section = WorkoutWebProgress.sectionForExerciseSlot(day: day, globalSlot: gs)
                    let nk = WorkoutWebProgress.localRowSetProgressKey(
                        planId: plan.id,
                        dayLabel: day.day,
                        section: section,
                        exercise: pair.exercise,
                        globalSlot: gs
                    )
                    out[nk, default: []].formUnion(sets)
                } else {
                    out[key] = sets
                }
            }
            newByDay[dayKey] = out
        }
        progressByDay = newByDay
        persistToDefaults()
    }

    private func parseLegacySlotStorageKey(_ key: String) -> (planIndex: Int, globalSlot: Int)? {
        // "slot:3:5"
        guard key.hasPrefix("slot:") else { return nil }
        let parts = key.dropFirst(5).split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2,
              let pi = Int(parts[0]),
              let gs = Int(parts[1]) else { return nil }
        return (planIndex: pi, globalSlot: gs)
    }

    /// Full map to send on sync POST (must include server keys so Dynamo isn’t wiped).
    public func webWorkoutProgressDictionaryForSync() -> [String: String] {
        webProgressMap
    }

    /// Keys for `POST /api/data/sync`: merges `webProgressMap` with web-style keys derived from
    /// `progressByDay` so native-only completions (per-set rows without timestamps in `webProgressMap`)
    /// still sync and do not cause an empty `{}` push that would wipe the server.
    public func webWorkoutProgressMergedForSync(plan: FitnessPlan?) -> [String: String] {
        var result = webProgressMap
        guard let plan else { return result }

        for (dayKey, _) in progressByDay {
            guard let dayDate = DateHelpers.date(from: dayKey) else { continue }
            guard let planIndex = WorkoutProgramSchedule.planIndex(for: plan, date: dayDate),
                  planIndex >= 0,
                  planIndex < plan.workoutPlan.weeklyPlan.count
            else { continue }

            let day = plan.workoutPlan.weeklyPlan[planIndex]
            let completionTs = completionTimestampForSyncDay(dayKey: dayKey, calendarDay: dayDate)

            for pair in day.enumeratedExerciseSlots() {
                let section = WorkoutWebProgress.sectionForExerciseSlot(day: day, globalSlot: pair.globalSlot)
                let ctx = WorkoutSetProgressContext(
                    planId: plan.id,
                    planIndex: planIndex,
                    globalSlot: pair.globalSlot,
                    section: section,
                    workoutDay: day,
                    progressDayKey: dayKey
                )
                let n = pair.exercise.effectiveSetCount
                let allDone = (0..<n).allSatisfy { i in
                    isSetComplete(
                        exerciseName: pair.exercise.name,
                        setIndex: i,
                        dayKey: dayKey,
                        planIndex: planIndex,
                        globalSlot: pair.globalSlot,
                        webContext: ctx,
                        exercise: pair.exercise
                    )
                }
                guard allDone else { continue }

                let weekMon = DateHelpers.mondayWeekStartString(containingCalendarDay: dayKey)
                let legacy = WorkoutWebProgress.legacyKey(
                    planId: plan.id,
                    dayLabel: day.day,
                    section: section,
                    exercise: pair.exercise
                )
                let scoped = WorkoutWebProgress.weekScopedKey(
                    planId: plan.id,
                    weekStartMondayYyyyMmDd: weekMon,
                    dayLabel: day.day,
                    section: section,
                    exercise: pair.exercise
                )
                if result[legacy] == nil { result[legacy] = completionTs }
                if result[scoped] == nil { result[scoped] = completionTs }
            }
        }
        return result
    }

    private func completionTimestampForSyncDay(dayKey: String, calendarDay: Date) -> String {
        let cal = Calendar.current
        let noon = cal.date(bySettingHour: 12, minute: 0, second: 0, of: calendarDay) ?? calendarDay
        return isoFull.string(from: noon)
    }

    private func markAllSets(
        planId: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExercise,
        globalSlot: Int,
        dayKey: String,
        setCount: Int
    ) {
        let sk = WorkoutWebProgress.localRowSetProgressKey(
            planId: planId,
            dayLabel: dayLabel,
            section: section,
            exercise: exercise,
            globalSlot: globalSlot
        )
        var dayMap = progressByDay[dayKey] ?? [:]
        var sets = dayMap[sk] ?? []
        for i in 0..<setCount { sets.insert("set_\(i)") }
        dayMap[sk] = sets
        progressByDay[dayKey] = dayMap
    }

    // MARK: - Set progress (per day)

    private func slotStorageKey(planIndex: Int, globalSlot: Int) -> String {
        "slot:\(planIndex):\(globalSlot)"
    }

    private func rowSetProgressStorageKey(context: WorkoutSetProgressContext, exercise: WorkoutExercise) -> String {
        WorkoutWebProgress.localRowSetProgressKey(
            planId: context.planId,
            dayLabel: context.workoutDay.day,
            section: context.section,
            exercise: exercise,
            globalSlot: context.globalSlot
        )
    }

    public func markSetComplete(
        exerciseName: String,
        setIndex: Int,
        dayKey: String? = nil,
        planIndex: Int? = nil,
        globalSlot: Int? = nil,
        webContext: WorkoutSetProgressContext? = nil,
        exerciseForWeb: WorkoutExercise? = nil
    ) {
        let day = dayKey ?? DateHelpers.todayString()
        var dayMap = progressByDay[day] ?? [:]
        let storageKey = resolveStorageKey(exerciseName: exerciseName, planIndex: planIndex, globalSlot: globalSlot, webContext: webContext, exerciseForWeb: exerciseForWeb)
        var sets = dayMap[storageKey] ?? []
        sets.insert("set_\(setIndex)")
        dayMap[storageKey] = sets
        progressByDay[day] = dayMap
        persistToDefaults()

        if let ctx = webContext, let ex = exerciseForWeb {
            refreshWebProgressKeys(context: ctx, exercise: ex)
            persistToDefaults()
            postSyncNotification()
        }
    }

    public func unmarkSetComplete(
        exerciseName: String,
        setIndex: Int,
        dayKey: String? = nil,
        planIndex: Int? = nil,
        globalSlot: Int? = nil,
        webContext: WorkoutSetProgressContext? = nil,
        exerciseForWeb: WorkoutExercise? = nil
    ) {
        let day = dayKey ?? DateHelpers.todayString()
        var dayMap = progressByDay[day] ?? [:]
        let storageKey = resolveStorageKey(exerciseName: exerciseName, planIndex: planIndex, globalSlot: globalSlot, webContext: webContext, exerciseForWeb: exerciseForWeb)
        var sets = dayMap[storageKey] ?? []
        sets.remove("set_\(setIndex)")
        if sets.isEmpty {
            dayMap.removeValue(forKey: storageKey)
        } else {
            dayMap[storageKey] = sets
        }
        if dayMap.isEmpty {
            progressByDay.removeValue(forKey: day)
        } else {
            progressByDay[day] = dayMap
        }
        persistToDefaults()

        if let ctx = webContext, let ex = exerciseForWeb {
            refreshWebProgressKeys(context: ctx, exercise: ex)
            persistToDefaults()
            postSyncNotification()
        }
    }

    private func resolveStorageKey(
        exerciseName: String,
        planIndex: Int?,
        globalSlot: Int?,
        webContext: WorkoutSetProgressContext?,
        exerciseForWeb: WorkoutExercise?
    ) -> String {
        if let ctx = webContext, let ex = exerciseForWeb {
            return rowSetProgressStorageKey(context: ctx, exercise: ex)
        } else if let pi = planIndex, let gs = globalSlot {
            return slotStorageKey(planIndex: pi, globalSlot: gs)
        }
        return exerciseName
    }

    private func refreshWebProgressKeys(context: WorkoutSetProgressContext, exercise: WorkoutExercise) {
        let n = exercise.effectiveSetCount
        let allDone = (0..<n).allSatisfy {
            isSetComplete(
                exerciseName: exercise.name,
                setIndex: $0,
                dayKey: context.progressDayKey,
                planIndex: context.planIndex,
                globalSlot: context.globalSlot,
                webContext: context,
                exercise: exercise
            )
        }
        let weekMon = DateHelpers.mondayWeekStartString(containingCalendarDay: context.progressDayKey)
        let legacy = WorkoutWebProgress.legacyKey(
            planId: context.planId,
            dayLabel: context.workoutDay.day,
            section: context.section,
            exercise: exercise
        )
        let scoped = WorkoutWebProgress.weekScopedKey(
            planId: context.planId,
            weekStartMondayYyyyMmDd: weekMon,
            dayLabel: context.workoutDay.day,
            section: context.section,
            exercise: exercise
        )
        if allDone {
            let ts = isoFull.string(from: .now)
            webProgressMap[legacy] = ts
            webProgressMap[scoped] = ts
        } else {
            webProgressMap.removeValue(forKey: legacy)
            webProgressMap.removeValue(forKey: scoped)
        }
    }

    public func isSetComplete(
        exerciseName: String,
        setIndex: Int,
        dayKey: String? = nil,
        planIndex: Int? = nil,
        globalSlot: Int? = nil,
        webContext: WorkoutSetProgressContext? = nil,
        exercise: WorkoutExercise? = nil
    ) -> Bool {
        let day = dayKey ?? DateHelpers.todayString()
        let tag = "set_\(setIndex)"
        if let ctx = webContext, let ex = exercise {
            let rk = rowSetProgressStorageKey(context: ctx, exercise: ex)
            if progressByDay[day]?[rk]?.contains(tag) == true { return true }
        }
        if let pi = planIndex, let gs = globalSlot {
            let sk = slotStorageKey(planIndex: pi, globalSlot: gs)
            if progressByDay[day]?[sk]?.contains(tag) == true { return true }
        }
        return progressByDay[day]?[exerciseName]?.contains(tag) ?? false
    }

    /// Clears slot progress for a calendar day and removes web entries whose completion date matches that day.
    public func resetDayProgress(dayKey: String? = nil) {
        let day = dayKey ?? DateHelpers.todayString()
        progressByDay[day] = nil
        webProgressMap = webProgressMap.filter { _, v in
            String(v.prefix(10)) != day
        }
        persistToDefaults()
        postSyncNotification()
    }

    /// Matches web planner: one unit per exercise row (warm-up + main + finisher).
    public func completedExerciseCount(for day: WorkoutDay, dayKey: String, planIndex: Int, planId: String) -> Int {
        day.enumeratedExerciseSlots().reduce(0) { count, pair in
            let n = pair.exercise.effectiveSetCount
            let section = WorkoutWebProgress.sectionForExerciseSlot(day: day, globalSlot: pair.globalSlot)
            let ctx = WorkoutSetProgressContext(
                planId: planId,
                planIndex: planIndex,
                globalSlot: pair.globalSlot,
                section: section,
                workoutDay: day,
                progressDayKey: dayKey
            )
            let allDone = (0..<n).allSatisfy {
                isSetComplete(
                    exerciseName: pair.exercise.name,
                    setIndex: $0,
                    dayKey: dayKey,
                    planIndex: planIndex,
                    globalSlot: pair.globalSlot,
                    webContext: ctx,
                    exercise: pair.exercise
                )
            }
            return count + (allDone ? 1 : 0)
        }
    }

    public func isWorkoutDayFullyComplete(_ day: WorkoutDay, dayKey: String, planIndex: Int, planId: String) -> Bool {
        let total = day.exerciseSlotCount
        guard total > 0 else { return false }
        return completedExerciseCount(for: day, dayKey: dayKey, planIndex: planIndex, planId: planId) >= total
    }

    /// Calendar days with any logged set progress (for dot indicators). Excludes future dates.
    public func calendarDatesWithProgress(onOrBefore today: String = DateHelpers.todayString()) -> Set<String> {
        var dates = Set(progressByDay.keys.filter { !$0.isEmpty && $0 <= today })
        for ts in webProgressMap.values {
            let day = String(ts.prefix(10))
            if day <= today { dates.insert(day) }
        }
        return dates
    }

    /// Mark or clear every exercise row on a session (web "Mark all complete" parity).
    public func setDayCompletion(
        day: WorkoutDay,
        dayKey: String,
        planIndex: Int,
        planId: String,
        complete: Bool
    ) {
        for pair in day.enumeratedExerciseSlots() {
            let section = WorkoutWebProgress.sectionForExerciseSlot(day: day, globalSlot: pair.globalSlot)
            let ctx = WorkoutSetProgressContext(
                planId: planId,
                planIndex: planIndex,
                globalSlot: pair.globalSlot,
                section: section,
                workoutDay: day,
                progressDayKey: dayKey
            )
            if complete {
                markAllSets(
                    planId: planId,
                    dayLabel: day.day,
                    section: section,
                    exercise: pair.exercise,
                    globalSlot: pair.globalSlot,
                    dayKey: dayKey,
                    setCount: pair.exercise.effectiveSetCount
                )
            } else {
                clearAllSets(
                    planId: planId,
                    dayLabel: day.day,
                    section: section,
                    exercise: pair.exercise,
                    globalSlot: pair.globalSlot,
                    dayKey: dayKey
                )
            }
            refreshWebProgressKeys(context: ctx, exercise: pair.exercise)
        }
        persistToDefaults()
        postSyncNotification()
    }

    private func clearAllSets(
        planId: String,
        dayLabel: String,
        section: String,
        exercise: WorkoutExercise,
        globalSlot: Int,
        dayKey: String
    ) {
        let sk = WorkoutWebProgress.localRowSetProgressKey(
            planId: planId,
            dayLabel: dayLabel,
            section: section,
            exercise: exercise,
            globalSlot: globalSlot
        )
        var dayMap = progressByDay[dayKey] ?? [:]
        dayMap.removeValue(forKey: sk)
        if dayMap.isEmpty {
            progressByDay.removeValue(forKey: dayKey)
        } else {
            progressByDay[dayKey] = dayMap
        }
    }

    // MARK: - API

    /// Search for an exercise by name. The server returns a **single** best-match object
    /// (not an array). Resolves the relative `gifUrl` against the API base URL so callers
    /// get a fully qualified URL they can pass to an image view.
    /// Returns the resolved results directly so concurrent callers never race on `exerciseResults`.
    @discardableResult
    public func searchExercises(name: String) async throws -> [ExerciseSearchResult] {
        isSearching = true
        defer { isSearching = false }
        do {
            var result: ExerciseSearchResult = try await api.request(WorkoutAPI.exerciseSearch(name: name))

            // Server returns a relative path like "/api/exercises/gif?id=...". Build absolute URL.
            // The path is already percent-encoded, so resolve it as-is: rebuilding the query
            // through URLComponents.query re-encodes "%20" into "%2520" and breaks the
            // server's name-based GIF fallback.
            if let relPath = result.gifUrl, !relPath.hasPrefix("http") {
                let absoluteUrl = URL(string: relPath, relativeTo: api.baseURL)?.absoluteString ?? relPath
                result = ExerciseSearchResult(
                    id: result.id,
                    name: result.name,
                    gifUrl: absoluteUrl,
                    targetMuscles: result.targetMuscles,
                    instructions: result.instructions
                )
            } else if result.gifUrl == nil {
                // Exercise search may return no direct match; fallback to name-based GIF proxy lookup.
                result = ExerciseSearchResult(
                    id: result.id,
                    name: result.name,
                    gifUrl: fallbackGifURLString(for: name),
                    targetMuscles: result.targetMuscles,
                    instructions: result.instructions
                )
            }

            exerciseResults = [result]
            return [result]
        } catch {
            // Keep workout demos resilient when upstream ExerciseDB search is unavailable.
            let fallback = ExerciseSearchResult(
                id: "fallback-\(name.lowercased().replacingOccurrences(of: " ", with: "-"))",
                name: name,
                gifUrl: fallbackGifURLString(for: name),
                targetMuscles: nil,
                instructions: nil
            )
            exerciseResults = [fallback]
            return [fallback]
        }
    }

    private func fallbackGifURLString(for name: String) -> String? {
        var components = URLComponents(url: api.baseURL, resolvingAgainstBaseURL: false)
        components?.path = "/api/exercises/gif"
        components?.queryItems = [
            URLQueryItem(name: "id", value: "0000"),
            URLQueryItem(name: "name", value: name)
        ]
        return components?.url?.absoluteString
    }

    public func getExerciseGifURL(id: String) async throws -> URL? {
        let result: ExerciseSearchResult = try await api.request(WorkoutAPI.exerciseGif(id: id))
        guard let relPath = result.gifUrl else { return nil }
        if relPath.hasPrefix("http") { return URL(string: relPath) }
        return URL(string: relPath, relativeTo: api.baseURL)?.absoluteURL
    }

    public func assessRecovery(biofeedback: [String: Int]) async throws -> RecoveryAssessment {
        return try await api.request(
            WorkoutAPI.recoveryAdjust(payload: RecoveryPayload(biofeedback: biofeedback, wearableData: nil))
        )
    }

    /// Fetches a URL and returns a single day or multi-day program (web `/api/workouts/parse-url` parity).
    public func parseWorkoutImport(_ url: String) async throws -> WorkoutImportResult {
        let response: WorkoutImportResponse = try await api.request(WorkoutAPI.parseUrl(url: url))
        return WorkoutImportResult(
            workout: response.workout,
            days: response.days,
            programTitle: response.programTitle
        )
    }

    public func parseWorkoutUrl(_ url: String) async throws -> WorkoutDay {
        try await parseWorkoutImport(url).workout
    }

    /// Uploads a text-based workout PDF (web `/api/workouts/parse-pdf` parity).
    public func parseWorkoutPdf(_ data: Data, fileName: String = "workout.pdf") async throws -> WorkoutImportResult {
        let response: WorkoutImportResponse = try await api.upload(
            WorkoutAPI.parsePdf,
            fileData: data,
            fieldName: "file",
            fileName: fileName,
            mimeType: "application/pdf"
        )
        return WorkoutImportResult(
            workout: response.workout,
            days: response.days,
            programTitle: response.programTitle
        )
    }
}
