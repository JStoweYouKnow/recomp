import Foundation
import SwiftData

/// Background SwiftData actor that reads local models for push and upserts server
/// data on pull. Conforms to `ModelActor` so SwiftData operations are safely
/// isolated to this actor's serial executor — no main-thread required.
public actor SyncService: ModelActor {

    // MARK: - ModelActor requirements
    public let modelContainer: ModelContainer
    public let modelExecutor: any ModelExecutor

    // MARK: - Private state
    private let api: APIClient
    private var syncTask: Task<Void, Never>?
    private var isDirty = false
    /// Bumped on every `markDirty()`. `syncNow()` captures it before pushing and only
    /// clears `isDirty` if no new edits arrived during the in-flight request, so changes
    /// made mid-sync are never silently dropped (actor reentrancy at the `await`).
    private var dirtyGeneration = 0
    /// Bumped at both the start AND end of every `syncNow()` call — regardless of whether
    /// the caller went through `markDirty()` (some, like the Rico chat flow, call `syncNow()`
    /// directly). `fetchAndApply()` snapshots this before its GET and re-checks it before
    /// applying the destructive half of the meal merge: any push that started, finished, or
    /// did both while the GET was in flight moves this counter, which is exactly the window
    /// where the pull's response can't be trusted to reflect that push's write yet.
    private var syncActivityGeneration = 0
    private let iso8601 = ISO8601DateFormatter()

    /// True when local edits are waiting for the next push (meals, plan, etc.).
    public var hasPendingChanges: Bool { isDirty }

    public init(api: APIClient = .shared, modelContainer: ModelContainer) {
        self.api = api
        self.modelContainer = modelContainer
        let context = ModelContext(modelContainer)
        self.modelExecutor = DefaultSerialModelExecutor(modelContext: context)
    }

    // MARK: - Push (local → server)

    public func markDirty() {
        isDirty = true
        dirtyGeneration &+= 1
        scheduleSync()
    }

    public func scheduleSync() {
        syncTask?.cancel()
        syncTask = Task {
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled, isDirty else { return }
            await syncNow()
        }
    }

    public func syncNow() async -> Bool {
        syncActivityGeneration &+= 1
        defer { syncActivityGeneration &+= 1 }
        let attemptedGeneration = dirtyGeneration
        do {
            let meals           = fetchAllMealsFromStore()
            let milestones      = (try? modelContext.fetch(FetchDescriptor<Milestone>())) ?? []
            let plans           = (try? modelContext.fetch(FetchDescriptor<FitnessPlan>())) ?? []
            let profiles        = (try? modelContext.fetch(FetchDescriptor<UserProfile>())) ?? []
            let hydrationItems  = (try? modelContext.fetch(FetchDescriptor<HydrationEntry>())) ?? []
            let fastingSessions = (try? modelContext.fetch(FetchDescriptor<FastingSession>())) ?? []
            let biofeedback     = (try? modelContext.fetch(FetchDescriptor<BiofeedbackEntry>())) ?? []
            let supplements     = (try? modelContext.fetch(FetchDescriptor<Supplement>())) ?? []
            let bloodWorkItems  = (try? modelContext.fetch(FetchDescriptor<BloodWork>())) ?? []
            let bodyScans       = (try? modelContext.fetch(FetchDescriptor<BodyScan>())) ?? []
            let pantryItems     = (try? modelContext.fetch(FetchDescriptor<PantryItem>())) ?? []
            let activityLogs    = (try? modelContext.fetch(FetchDescriptor<ActivityLogEntry>())) ?? []
            let wearableConns   = (try? modelContext.fetch(FetchDescriptor<WearableConnection>())) ?? []
            let wearableDays    = (try? modelContext.fetch(FetchDescriptor<WearableDaySummary>())) ?? []
            let metabolicModels = (try? modelContext.fetch(FetchDescriptor<MetabolicModel>())) ?? []

            let mealDTOs        = meals.map { MealEntryDTO(from: $0, iso8601: iso8601) }
            let milestoneDTOs   = milestones.map { MilestoneEntryDTO(from: $0, iso8601: iso8601) }
            let planDTO         = plans.first.map { FitnessPlanDTO(from: $0, iso8601: iso8601) }
            let profileDTO      = profiles.first.map { $0.toDTO(createdAtISO: iso8601.string(from: $0.createdAt)) }
            let hydrationDTOs   = hydrationItems.map { HydrationEntryDTO(from: $0) }
            let fastingDTOs     = fastingSessions.map { FastingSessionDTO(from: $0, iso8601: iso8601) }
            let biofeedbackDTOs = biofeedback.map { BiofeedbackEntryDTO(from: $0) }
            let supplementDTOs  = supplements.map { SupplementDTO(from: $0) }
            let bloodWorkDTOs   = bloodWorkItems.map { BloodWorkDTO(from: $0) }
            let bodyScanDTOs    = bodyScans.map { BodyScanDTO(from: $0) }
            let pantryDTOs      = pantryItems.map { PantryItemDTO(from: $0, iso8601: iso8601) }
            let activityLogDTOs = activityLogs.map { ActivityLogEntryDTO(from: $0, iso8601: iso8601) }
            let wearableConnDTOs = wearableConns.map(wearableConnectionDTO(from:))
            let wearableDataDTOs = wearableDays.map(wearableDayDTO(from:))
            let metabolicDTO    = metabolicModels.first.map(metabolicModelDTO(from:))

            let xpTotal = MacroCalculator.totalXp(from: milestones)
            let defaults = RecompAppGroupDefaults.shared
            let hasAdjustedFlag = defaults.bool(forKey: RecompUserDefaultsKeys.hasAdjustedPlan)
            let ricoForPush: [RicoMessageDTO]? = CoachHistoryStore.historyForPush(container: modelContainer)

            let measurementTargetsPayload: MeasurementTargetsDTO? = {
                guard let mt = MeasurementTargetsStorage.load() else { return nil }
                return MeasurementTargetsDTO(
                    targetWeightLbs: mt.targetWeightLbs,
                    targetBodyFatPercent: mt.targetBodyFatPercent,
                    targetMuscleMassLbs: mt.targetMuscleMassLbs
                )
            }()

            let planModel = plans.first
            let workoutMerged = await MainActor.run {
                WorkoutService.shared.webWorkoutProgressMergedForSync(plan: planModel)
            }
            let workoutPayload: [String: String]? = workoutMerged.isEmpty ? nil : workoutMerged

            let savedRecipeDTOs: [SavedRecipeDTO]? = {
                let records = SavedRecipesStorage.load()
                guard !records.isEmpty else { return nil }
                return records.map { r in
                    SavedRecipeDTO(
                        id: r.id,
                        name: r.name,
                        description: r.description,
                        calories: r.calories,
                        protein: r.protein,
                        carbs: r.carbs,
                        fat: r.fat,
                        recipeUrl: r.recipeUrl,
                        source: r.source,
                        mealTypes: r.mealTypes,
                        servings: r.servings,
                        addedAt: r.addedAt
                    )
                }
            }()

            let mealPrepPlanDTO: MealPrepPlanDTO? = {
                let plans = (try? modelContext.fetch(FetchDescriptor<MealPrepPlan>())) ?? []
                guard let latest = plans.max(by: { $0.createdAt < $1.createdAt }) else { return nil }
                return MealPrepPlanDTO(
                    id: latest.id,
                    weekStart: latest.weekStart,
                    recipes: latest.recipes,
                    groceryList: latest.groceryList,
                    batchInstructions: latest.batchInstructions,
                    estimatedPrepTime: latest.estimatedPrepTime,
                    createdAt: iso8601.string(from: latest.createdAt)
                )
            }()

            let payload = SyncPayload(
                profile: profileDTO,
                meals: mealDTOs.isEmpty ? nil : mealDTOs,
                plan: planDTO,
                milestones: milestoneDTOs.isEmpty ? nil : milestoneDTOs,
                hydration: hydrationDTOs.isEmpty ? nil : hydrationDTOs,
                fastingSessions: fastingDTOs.isEmpty ? nil : fastingDTOs,
                biofeedback: biofeedbackDTOs.isEmpty ? nil : biofeedbackDTOs,
                supplements: supplementDTOs.isEmpty ? nil : supplementDTOs,
                bloodWork: bloodWorkDTOs.isEmpty ? nil : bloodWorkDTOs,
                bodyScans: bodyScanDTOs.isEmpty ? nil : bodyScanDTOs,
                pantry: pantryDTOs.isEmpty ? nil : pantryDTOs,
                savedRecipes: savedRecipeDTOs,
                mealPrepPlan: mealPrepPlanDTO,
                activityLog: activityLogDTOs.isEmpty ? nil : activityLogDTOs,
                workoutProgress: workoutPayload,
                wearableConnections: wearableConnDTOs.isEmpty ? nil : wearableConnDTOs,
                wearableData: wearableDataDTOs.isEmpty ? nil : wearableDataDTOs,
                metabolicModel: metabolicDTO,
                xp: xpTotal,
                hasAdjusted: hasAdjustedFlag ? true : nil,
                ricoHistory: ricoForPush,
                recentExerciseNames: nil,
                measurementTargets: measurementTargetsPayload
            )
            try await api.requestVoid(MiscAPI.dataSync(payload: payload))
            markAllMealsSyncedInStore()
            // Only clear the dirty flag if no new edits landed while the push was
            // in flight; otherwise leave it set so the queued resync picks them up.
            if dirtyGeneration == attemptedGeneration {
                isDirty = false
            }
            return true
        } catch {
            isDirty = true
            scheduleSync() // auto-retry after failed sync
            return false
        }
    }

    // MARK: - Pull (server → local)

    /// Fetches the full snapshot from the server and upserts it into the local store.
    public func fetchAndApply() async throws {
        // Actors are reentrant across `await` — a concurrent push (e.g. Rico logging a
        // meal via CoachChatView's own syncNow()) can insert+mark-synced a meal *while*
        // this GET is in flight. If that happens, this response no longer reflects the
        // full current state, and the destructive half of applyMealPullFromServer (delete
        // any local "synced" meal missing from the response) would wrongly erase the meal
        // that push just landed. Snapshot syncActivityGeneration before the request so we
        // can detect that race and skip deletions this round.
        let syncActivityAtPullStart = syncActivityGeneration
        let data = try await api.requestRaw(MiscAPI.dataFetch)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let response = try decoder.decode(SyncResponseDTO.self, from: data)

        // Keep the matching profile row's identity stable across pulls (so an
        // in-memory reference held by AuthService stays valid), but still remove
        // stale demo/old-account rows with a different ID. When the server returns
        // no profile, keep the local one rather than wiping it.
        if let dto = response.profile {
            let keepId = dto.id
            for p in (try? modelContext.fetch(FetchDescriptor<UserProfile>())) ?? [] where p.id != keepId {
                modelContext.delete(p)
            }
            upsertProfile(dto)
        }

        for p in (try? modelContext.fetch(FetchDescriptor<FitnessPlan>())) ?? [] { modelContext.delete(p) }
        if let dto = response.plan    { upsertPlan(dto) }

        let mealDTOsFromServer = response.meals

        if let milestoneDTOs = response.milestones {
            for x in (try? modelContext.fetch(FetchDescriptor<Milestone>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in milestoneDTOs {
                if let milestone = Milestone(dto: dto, iso8601: iso8601) {
                    modelContext.insert(milestone)
                }
            }
        }

        if let hydrationDTOs = response.hydration {
            for x in (try? modelContext.fetch(FetchDescriptor<HydrationEntry>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in hydrationDTOs {
                modelContext.insert(HydrationEntry(dto: dto))
            }
        }

        if let fastingDTOs = response.fastingSessions {
            for x in (try? modelContext.fetch(FetchDescriptor<FastingSession>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in fastingDTOs {
                if let session = FastingSession(dto: dto, iso8601: iso8601) {
                    modelContext.insert(session)
                }
            }
        }

        if let biofeedbackDTOs = response.biofeedback {
            for x in (try? modelContext.fetch(FetchDescriptor<BiofeedbackEntry>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in biofeedbackDTOs {
                modelContext.insert(BiofeedbackEntry(dto: dto))
            }
        }

        if let supplementDTOs = response.supplements {
            for x in (try? modelContext.fetch(FetchDescriptor<Supplement>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in supplementDTOs {
                modelContext.insert(Supplement(dto: dto))
            }
        }

        if let bloodWorkDTOs = response.bloodWork {
            for x in (try? modelContext.fetch(FetchDescriptor<BloodWork>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in bloodWorkDTOs {
                modelContext.insert(BloodWork(dto: dto))
            }
        }

        if let bodyScanDTOs = response.bodyScans {
            for x in (try? modelContext.fetch(FetchDescriptor<BodyScan>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in bodyScanDTOs {
                modelContext.insert(BodyScan(dto: dto))
            }
        }

        if let pantryDTOs = response.pantry {
            for x in (try? modelContext.fetch(FetchDescriptor<PantryItem>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in pantryDTOs {
                if let item = PantryItem(dto: dto, iso8601: iso8601) {
                    modelContext.insert(item)
                }
            }
        }

        if let savedRecipeDTOs = response.savedRecipes {
            let records = savedRecipeDTOs.map { dto in
                SavedRecipeRecord(
                    id: dto.id,
                    name: dto.name,
                    description: dto.description,
                    calories: dto.calories,
                    protein: dto.protein,
                    carbs: dto.carbs,
                    fat: dto.fat,
                    recipeUrl: dto.recipeUrl,
                    source: dto.source,
                    mealTypes: dto.mealTypes,
                    servings: dto.servings,
                    addedAt: dto.addedAt
                )
            }
            SavedRecipesStorage.save(records)
        }

        if let mealPrepDTO = response.mealPrepPlan {
            let existing = (try? modelContext.fetch(FetchDescriptor<MealPrepPlan>())) ?? []
            // Replace local plans only when the server copy is different — a same-id
            // plan with identical content should not churn SwiftData on every pull.
            let localLatest = existing.max(by: { $0.createdAt < $1.createdAt })
            let differs = localLatest.map {
                $0.id != mealPrepDTO.id
                    || $0.groceryList != mealPrepDTO.groceryList
                    || $0.recipes.count != mealPrepDTO.recipes.count
            } ?? true
            if differs {
                for x in existing { modelContext.delete(x) }
                modelContext.insert(
                    MealPrepPlan(
                        id: mealPrepDTO.id,
                        weekStart: mealPrepDTO.weekStart,
                        recipes: mealPrepDTO.recipes,
                        groceryList: mealPrepDTO.groceryList,
                        batchInstructions: mealPrepDTO.batchInstructions,
                        estimatedPrepTime: mealPrepDTO.estimatedPrepTime,
                        createdAt: iso8601.date(from: mealPrepDTO.createdAt) ?? .now
                    )
                )
            }
        }

        if let wearableConnectionDTOs = response.wearableConnections {
            for x in (try? modelContext.fetch(FetchDescriptor<WearableConnection>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in wearableConnectionDTOs {
                if let conn = WearableConnection(dto: dto, iso8601: iso8601) {
                    modelContext.insert(conn)
                }
            }
        }

        if let wearableDataDTOs = response.wearableData {
            for x in (try? modelContext.fetch(FetchDescriptor<WearableDaySummary>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in wearableDataDTOs {
                if let summary = WearableDaySummary(dto: dto) {
                    modelContext.insert(summary)
                }
            }
        }

        // Server always returns `activityLog` as an array (possibly empty) so we replace local rows.
        for x in (try? modelContext.fetch(FetchDescriptor<ActivityLogEntry>())) ?? [] {
            modelContext.delete(x)
        }
        for dto in response.activityLog {
            modelContext.insert(ActivityLogEntry(dto: dto, iso8601: iso8601))
        }

        if let metabolicDTO = response.metabolicModel {
            for x in (try? modelContext.fetch(FetchDescriptor<MetabolicModel>())) ?? [] {
                modelContext.delete(x)
            }
            modelContext.insert(MetabolicModel(dto: metabolicDTO, iso8601: iso8601))
        }

        try modelContext.save()

        if let mealDTOsFromServer {
            let racedWithConcurrentPush = syncActivityGeneration != syncActivityAtPullStart
            try applyMealPullFromServer(mealDTOsFromServer, skipDeletions: racedWithConcurrentPush)
        }

        let planForWorkouts = (try? modelContext.fetch(FetchDescriptor<FitnessPlan>()))?.first
        await MainActor.run {
            WorkoutService.shared.replaceWebProgressFromServer(response.workoutProgress ?? [:], plan: planForWorkouts)
        }
        persistRemoteMeta(response.meta)
    }

    private func persistRemoteMeta(_ meta: SyncMetaDTO?) {
        guard let meta else { return }
        let defaults = RecompAppGroupDefaults.shared
        if let xp = meta.xp {
            defaults.set(xp, forKey: RecompUserDefaultsKeys.remoteMetaXp)
        }
        if let h = meta.hasAdjusted, h {
            defaults.set(true, forKey: RecompUserDefaultsKeys.hasAdjustedPlan)
        }
        if let r = meta.ricoHistory, let data = try? JSONEncoder().encode(r) {
            defaults.set(data, forKey: RecompUserDefaultsKeys.ricoHistoryJSON)
        }
        if let mt = meta.measurementTargets, let data = try? JSONEncoder().encode(mt) {
            defaults.set(data, forKey: RecompUserDefaultsKeys.measurementTargetsJSON)
        }
    }

    private func wearableConnectionDTO(from c: WearableConnection) -> WearableConnectionDTO {
        WearableConnectionDTO(
            provider: c.provider.rawValue,
            connectedAt: iso8601.string(from: c.connectedAt),
            label: c.label
        )
    }

    private func wearableDayDTO(from w: WearableDaySummary) -> WearableDaySummaryDTO {
        WearableDaySummaryDTO(
            date: w.date,
            provider: w.provider.rawValue,
            steps: w.steps,
            caloriesBurned: w.caloriesBurned,
            activeMinutes: w.activeMinutes,
            sleepScore: w.sleepScore,
            sleepDuration: w.sleepDuration,
            readinessScore: w.readinessScore,
            heartRateAvg: w.heartRateAvg,
            heartRateResting: w.heartRateResting,
            weight: w.weight,
            bodyFatPercent: w.bodyFatPercent,
            muscleMass: w.muscleMass,
            weightUnit: "lbs",
            muscleMassUnit: "lbs"
        )
    }

    private func metabolicModelDTO(from m: MetabolicModel) -> MetabolicModelDTO {
        MetabolicModelDTO(
            estimatedTDEE: m.estimatedTDEE,
            confidence: m.confidence,
            dataPoints: m.dataPoints.map {
                MetabolicDataPointDTO(
                    date: $0.date,
                    weightKg: $0.weightKg,
                    totalIntake: $0.totalIntake,
                    totalExpenditure: $0.totalExpenditure
                )
            },
            lastUpdated: iso8601.string(from: m.lastUpdated),
            history: m.history.map {
                MetabolicHistoryEntryDTO(date: $0.date, tdee: $0.tdee, confidence: $0.confidence)
            }
        )
    }

    // MARK: - Meal store helpers

    /// Reads meals from a fresh context so UI-thread saves are visible before push/pull.
    private func fetchAllMealsFromStore() -> [MealEntry] {
        let fresh = ModelContext(modelContainer)
        return (try? fresh.fetch(FetchDescriptor<MealEntry>())) ?? []
    }

    private func markAllMealsSyncedInStore() {
        let fresh = ModelContext(modelContainer)
        let meals = (try? fresh.fetch(FetchDescriptor<MealEntry>())) ?? []
        for meal in meals {
            meal.synced = true
        }
        try? fresh.save()
    }

    /// Merges server meals on a fresh context so the ModelActor cache cannot resurrect deleted rows.
    ///
    /// `skipDeletions` is set when a local edit landed concurrently with the GET that produced
    /// `mealDTOs` (see `fetchAndApply`): that response can't be trusted as complete anymore, so
    /// we only add what it knows about and leave every local row alone — the next, unraced pull
    /// will reconcile deletions once the dust settles.
    private func applyMealPullFromServer(_ mealDTOs: [MealEntryDTO], skipDeletions: Bool) throws {
        let fresh = ModelContext(modelContainer)
        let localMeals = try fresh.fetch(FetchDescriptor<MealEntry>())
        var knownKeys = Set(localMeals.map(\.syncKey))

        if !skipDeletions {
            let pendingKeys = Set(localMeals.filter { !$0.synced }.map(\.syncKey))
            let graceCutoff = Date().addingTimeInterval(-120)
            var protectedKeys = Set<String>()
            for meal in localMeals where meal.synced {
                if meal.loggedAt > graceCutoff {
                    protectedKeys.insert(meal.syncKey)
                    continue
                }
                fresh.delete(meal)
            }
            knownKeys = pendingKeys.union(protectedKeys)
        }

        for dto in mealDTOs {
            let key = Self.mealSyncKey(date: dto.date, id: dto.id)
            guard !knownKeys.contains(key) else { continue }
            if let meal = MealEntry(dto: dto, iso8601: iso8601) {
                fresh.insert(meal)
                knownKeys.insert(key)
            }
        }
        try fresh.save()
    }

    // MARK: - Upsert helpers

    private static func mealSyncKey(date: String, id: String) -> String {
        "\(date)#\(id)"
    }

    /// Thin wrapper over the shared `UserProfile.upsert(from:in:)` so the pull path
    /// and `AuthService` apply server profiles identically (including `proAccess`).
    private func upsertProfile(_ dto: UserProfileDTO) {
        UserProfile.upsert(from: dto, in: modelContext)
    }

    private func upsertPlan(_ dto: FitnessPlanDTO) {
        let id = dto.id
        var descriptor = FetchDescriptor<FitnessPlan>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1

        let createdAt = iso8601.date(from: dto.createdAt) ?? .now
        let dietPlan = DietPlan(
            dailyTargets:    dto.dietPlan.dailyTargets,
            trainingTargets: dto.dietPlan.trainingTargets,
            restTargets:     dto.dietPlan.restTargets,
            weeklyPlan:      dto.dietPlan.weeklyPlan,
            tips:            dto.dietPlan.tips
        )
        let workoutPlan = WorkoutPlan(
            weeklyPlan: dto.workoutPlan.weeklyPlan,
            tips:       dto.workoutPlan.tips,
            programWeek1Start: dto.workoutPlan.programWeek1Start,
            advancementMode: dto.workoutPlan.advancementMode,
            programWeekOffset: dto.workoutPlan.programWeekOffset,
            pausedUntil: dto.workoutPlan.pausedUntil,
            missedSessions: dto.workoutPlan.missedSessions,
            catchUpBannerDismissedAt: dto.workoutPlan.catchUpBannerDismissedAt
        )

        if let existing = (try? modelContext.fetch(descriptor))?.first {
            existing.createdAt   = createdAt
            existing.dietPlan    = dietPlan
            existing.workoutPlan = workoutPlan
            existing.reasoning   = dto.reasoning
            existing.synced      = true
        } else {
            modelContext.insert(FitnessPlan(
                id:          dto.id,
                userId:      dto.userId,
                createdAt:   createdAt,
                dietPlan:    dietPlan,
                workoutPlan: workoutPlan,
                reasoning:   dto.reasoning,
                synced:      true
            ))
        }
    }
}

// MARK: - DTO ↔ Model mapping

extension MealEntryDTO {
    init(from entry: MealEntry, iso8601: ISO8601DateFormatter) {
        self.init(
            id:        entry.id,
            date:      entry.date,
            mealType:  entry.mealType.rawValue,
            name:      entry.name,
            macros:    entry.macros,
            notes:     entry.notes,
            imageUrl:  entry.imageUrl,
            loggedAt:  iso8601.string(from: entry.loggedAt)
        )
    }
}

extension MilestoneEntryDTO {
    init(from milestone: Milestone, iso8601: ISO8601DateFormatter) {
        self.init(
            id:       milestone.id,
            earnedAt: iso8601.string(from: milestone.earnedAt),
            progress: milestone.progress
        )
    }
}

extension MealEntry {
    convenience init?(dto: MealEntryDTO, iso8601: ISO8601DateFormatter) {
        guard let mealType = MealType(rawValue: dto.mealType) else { return nil }
        let loggedAt = dto.loggedAt.flatMap { iso8601.date(from: $0) } ?? .now
        self.init(
            id:       dto.id,
            date:     dto.date,
            mealType: mealType,
            name:     dto.name,
            macros:   dto.macros,
            notes:    dto.notes,
            imageUrl: dto.imageUrl,
            loggedAt: loggedAt,
            synced:   true
        )
    }
}

extension Milestone {
    convenience init?(dto: MilestoneEntryDTO, iso8601: ISO8601DateFormatter) {
        guard let type = MilestoneType(rawValue: dto.id) else { return nil }
        let earnedAt = iso8601.date(from: dto.earnedAt) ?? .now
        self.init(milestoneType: type, earnedAt: earnedAt, progress: dto.progress)
    }
}

extension HydrationEntryDTO {
    init(from entry: HydrationEntry) {
        self.init(
            id:       entry.id,
            date:     entry.date,
            time:     entry.time,
            amountMl: entry.amountMl,
            source:   entry.source.rawValue  // non-nil when pushing from device
        )
    }
}

extension HydrationEntry {
    convenience init(dto: HydrationEntryDTO) {
        self.init(
            id:       dto.id,
            date:     dto.date,
            time:     dto.time,
            amountMl: dto.amountMl,
            source:   dto.source.flatMap { HydrationSource(rawValue: $0) } ?? .water
        )
    }
}

extension FastingSessionDTO {
    init(from session: FastingSession, iso8601: ISO8601DateFormatter) {
        self.init(
            id:               session.id,
            startTime:        iso8601.string(from: session.startTime),
            endTime:          session.endTime.map { iso8601.string(from: $0) },
            targetHours:      session.targetHours,
            fastingProtocol:  session.fastingProtocol.rawValue
        )
    }
}

extension FastingSession {
    convenience init?(dto: FastingSessionDTO, iso8601: ISO8601DateFormatter) {
        guard let start = iso8601.date(from: dto.startTime),
              let proto = FastingProtocol(rawValue: dto.fastingProtocol) else { return nil }
        let end = dto.endTime.flatMap { iso8601.date(from: $0) }
        self.init(
            id:               dto.id,
            startTime:        start,
            endTime:          end,
            targetHours:      dto.targetHours,
            fastingProtocol:  proto
        )
    }
}

extension BiofeedbackEntryDTO {
    init(from entry: BiofeedbackEntry) {
        self.init(
            id:       entry.id,
            date:     entry.date,
            time:     entry.time,
            energy:   entry.energy,
            mood:     entry.mood,
            hunger:   entry.hunger,
            stress:   entry.stress,
            soreness: entry.soreness,
            notes:    entry.notes
        )
    }
}

extension BiofeedbackEntry {
    convenience init(dto: BiofeedbackEntryDTO) {
        self.init(
            id:       dto.id,
            date:     dto.date,
            time:     dto.time,
            energy:   dto.energy,
            mood:     dto.mood,
            hunger:   dto.hunger,
            stress:   dto.stress,
            soreness: dto.soreness,
            notes:    dto.notes
        )
    }
}

public extension FitnessPlanDTO {
    public init(from plan: FitnessPlan, iso8601: ISO8601DateFormatter) {
        self.init(
            id:        plan.id,
            userId:    plan.userId,
            createdAt: iso8601.string(from: plan.createdAt),
            dietPlan: PlanDietPlanDTO(
                dailyTargets:    plan.dietPlan.dailyTargets,
                trainingTargets: plan.dietPlan.trainingTargets,
                restTargets:     plan.dietPlan.restTargets,
                weeklyPlan:      plan.dietPlan.weeklyPlan,
                tips:            plan.dietPlan.tips
            ),
            workoutPlan: PlanWorkoutPlanDTO(
                weeklyPlan: plan.workoutPlan.weeklyPlan,
                tips:       plan.workoutPlan.tips,
                programWeek1Start: plan.workoutPlan.programWeek1Start,
                advancementMode: plan.workoutPlan.advancementMode,
                programWeekOffset: plan.workoutPlan.programWeekOffset,
                pausedUntil: plan.workoutPlan.pausedUntil,
                missedSessions: plan.workoutPlan.missedSessions,
                catchUpBannerDismissedAt: plan.workoutPlan.catchUpBannerDismissedAt
            ),
            reasoning: plan.reasoning
        )
    }
}

// MARK: - Supplement

extension SupplementDTO {
    init(from supplement: Supplement) {
        self.init(
            id:        supplement.id,
            name:      supplement.name,
            dosage:    supplement.dosage,
            frequency: supplement.frequency.rawValue,
            timing:    supplement.timing.rawValue,
            takenToday: supplement.takenToday
        )
    }
}

extension Supplement {
    convenience init(dto: SupplementDTO) {
        self.init(
            id:        dto.id,
            name:      dto.name,
            dosage:    dto.dosage,
            frequency: SupplementFrequency(rawValue: dto.frequency) ?? .daily,
            timing:    SupplementTiming(rawValue: dto.timing) ?? .morning,
            takenToday: dto.takenToday ?? false
        )
    }
}

// MARK: - BloodWork

extension BloodWorkDTO {
    init(from bloodWork: BloodWork) {
        self.init(
            id:      bloodWork.id,
            date:    bloodWork.date,
            markers: bloodWork.markers.map { marker in
                BloodWorkMarkerDTO(
                    name:  marker.name,
                    value: marker.value,
                    unit:  marker.unit,
                    normalRange: BloodWorkMarkerDTO.NormalRangeDTO(
                        low:  marker.normalRange.low,
                        high: marker.normalRange.high
                    ),
                    status: marker.status.rawValue
                )
            },
            notes: bloodWork.notes
        )
    }
}

extension BloodWork {
    convenience init(dto: BloodWorkDTO) {
        self.init(
            id:   dto.id,
            date: dto.date,
            markers: dto.markers.map { m in
                BloodWorkMarker(
                    name:  m.name,
                    value: m.value,
                    unit:  m.unit,
                    normalRange: BloodWorkMarker.NormalRange(low: m.normalRange.low, high: m.normalRange.high),
                    status: BloodWorkStatus(rawValue: m.status) ?? .normal
                )
            },
            notes: dto.notes
        )
    }
}

// MARK: - BodyScan

extension BodyScanDTO {
    init(from scan: BodyScan) {
        self.init(
            id:               scan.id,
            date:             scan.date,
            photos:           BodyScanPhotosDTO(front: scan.photos.front, side: scan.photos.side, back: scan.photos.back),
            analysis:         scan.analysis,
            bodyFatEstimate:  scan.bodyFatEstimate,
            muscleAssessment: scan.muscleAssessment,
            notes:            scan.notes
        )
    }
}

extension BodyScan {
    convenience init(dto: BodyScanDTO) {
        self.init(
            id:               dto.id,
            date:             dto.date,
            photos:           BodyScanPhotos(front: dto.photos.front, side: dto.photos.side, back: dto.photos.back),
            analysis:         dto.analysis,
            bodyFatEstimate:  dto.bodyFatEstimate,
            muscleAssessment: dto.muscleAssessment,
            notes:            dto.notes
        )
    }
}

// MARK: - PantryItem

extension PantryItemDTO {
    init(from item: PantryItem, iso8601: ISO8601DateFormatter) {
        self.init(
            id:        item.id,
            name:      item.name,
            category:  item.category.rawValue,
            addedAt:   iso8601.string(from: item.addedAt),
            expiresAt: item.expiresAt.map { iso8601.string(from: $0) }
        )
    }
}

extension PantryItem {
    convenience init?(dto: PantryItemDTO, iso8601: ISO8601DateFormatter) {
        guard let category = PantryCategory(rawValue: dto.category),
              let addedAt = iso8601.date(from: dto.addedAt) else { return nil }
        self.init(
            id:        dto.id,
            name:      dto.name,
            category:  category,
            addedAt:   addedAt,
            expiresAt: dto.expiresAt.flatMap { iso8601.date(from: $0) }
        )
    }
}

// MARK: - WearableConnection

extension WearableConnection {
    convenience init?(dto: WearableConnectionDTO, iso8601: ISO8601DateFormatter) {
        guard let provider = WearableProvider(rawValue: dto.provider),
              let connectedAt = iso8601.date(from: dto.connectedAt) else { return nil }
        self.init(provider: provider, connectedAt: connectedAt, label: dto.label)
    }
}

// MARK: - WearableDaySummary

extension WearableDaySummary {
    convenience init?(dto: WearableDaySummaryDTO) {
        guard let provider = WearableProvider(rawValue: dto.provider) else { return nil }
        self.init(
            date:             dto.date,
            provider:         provider,
            steps:            dto.steps,
            caloriesBurned:   dto.caloriesBurned,
            activeMinutes:    dto.activeMinutes,
            sleepScore:       dto.sleepScore,
            sleepDuration:    dto.sleepDuration,
            heartRateAvg:     dto.heartRateAvg,
            heartRateResting: dto.heartRateResting,
            weight:           dto.weight,
            bodyFatPercent:   dto.bodyFatPercent,
            muscleMass:       dto.muscleMass
        )
        self.readinessScore = dto.readinessScore
    }
}

// MARK: - ActivityLogEntry

extension ActivityLogEntryDTO {
    init(from entry: ActivityLogEntry, iso8601: ISO8601DateFormatter) {
        self.init(
            id:                 entry.id,
            date:               entry.date,
            label:              entry.label,
            category:           entry.categoryRawValue,
            durationMinutes:    entry.durationMinutes,
            calorieAdjustment:  entry.calorieAdjustment,
            loggedAt:           iso8601.string(from: entry.loggedAt),
            entryType:          entry.entryType
        )
    }
}

extension ActivityLogEntry {
    convenience init(dto: ActivityLogEntryDTO, iso8601: ISO8601DateFormatter) {
        let loggedAt = dto.loggedAt.flatMap { iso8601.date(from: $0) } ?? .now
        // Map category string to ActivityCategory via ActivityType or SedentaryType
        let category: ActivityCategory
        if let at = ActivityType(rawValue: dto.category) {
            category = .activity(at)
        } else if let st = SedentaryType(rawValue: dto.category) {
            category = .sedentary(st)
        } else {
            category = .activity(.other)
        }
        self.init(
            id:                dto.id,
            date:              dto.date,
            entryType:         dto.entryType,
            label:             dto.label,
            category:          category,
            durationMinutes:   dto.durationMinutes,
            calorieAdjustment: dto.calorieAdjustment,
            loggedAt:          loggedAt
        )
    }
}

// MARK: - MetabolicModel

extension MetabolicModel {
    convenience init(dto: MetabolicModelDTO, iso8601: ISO8601DateFormatter) {
        let lastUpdated = iso8601.date(from: dto.lastUpdated) ?? .now
        self.init(
            estimatedTDEE: dto.estimatedTDEE,
            confidence:    dto.confidence,
            dataPoints:    dto.dataPoints.map {
                MetabolicDataPoint(date: $0.date, weightKg: $0.weightKg, totalIntake: $0.totalIntake, totalExpenditure: $0.totalExpenditure)
            },
            lastUpdated:   lastUpdated,
            history:       dto.history.map {
                MetabolicHistoryEntry(date: $0.date, tdee: $0.tdee, confidence: $0.confidence)
            }
        )
    }
}
