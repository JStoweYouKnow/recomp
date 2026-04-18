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
    private let iso8601 = ISO8601DateFormatter()

    public init(api: APIClient = .shared, modelContainer: ModelContainer) {
        self.api = api
        self.modelContainer = modelContainer
        let context = ModelContext(modelContainer)
        self.modelExecutor = DefaultSerialModelExecutor(modelContext: context)
    }

    // MARK: - Push (local → server)

    public func markDirty() {
        isDirty = true
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

    public func syncNow() async {
        isDirty = false
        do {
            let meals           = (try? modelContext.fetch(FetchDescriptor<MealEntry>())) ?? []
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
            let ricoForPush: [RicoMessageDTO]? = {
                guard let data = defaults.data(forKey: RecompUserDefaultsKeys.ricoHistoryJSON),
                      let decoded = try? JSONDecoder().decode([RicoMessageDTO].self, from: data),
                      !decoded.isEmpty else { return nil }
                return decoded
            }()

            let workoutWebMap = await MainActor.run {
                WorkoutService.shared.webWorkoutProgressDictionaryForSync()
            }

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
                activityLog: activityLogDTOs.isEmpty ? nil : activityLogDTOs,
                workoutProgress: workoutWebMap,
                wearableConnections: wearableConnDTOs.isEmpty ? nil : wearableConnDTOs,
                wearableData: wearableDataDTOs.isEmpty ? nil : wearableDataDTOs,
                metabolicModel: metabolicDTO,
                xp: xpTotal,
                hasAdjusted: hasAdjustedFlag ? true : nil,
                ricoHistory: ricoForPush,
                recentExerciseNames: nil,
                measurementTargets: nil
            )
            try await api.requestVoid(MiscAPI.dataSync(payload: payload))
        } catch {
            isDirty = true
            scheduleSync() // auto-retry after failed sync
        }
    }

    // MARK: - Pull (server → local)

    /// Fetches the full snapshot from the server and upserts it into the local store.
    public func fetchAndApply() async throws {
        let data = try await api.requestRaw(MiscAPI.dataFetch)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let response = try decoder.decode(SyncResponseDTO.self, from: data)

        // Full replace for profile and plan so stale demo/old-account records
        // with different IDs never survive a sync from a new authenticated account.
        for p in (try? modelContext.fetch(FetchDescriptor<UserProfile>())) ?? [] { modelContext.delete(p) }
        if let dto = response.profile { upsertProfile(dto) }

        for p in (try? modelContext.fetch(FetchDescriptor<FitnessPlan>())) ?? [] { modelContext.delete(p) }
        if let dto = response.plan    { upsertPlan(dto) }

        // Full replace so deletes and web-only edits converge (insert-only left orphans forever).
        if let mealDTOs = response.meals {
            for m in (try? modelContext.fetch(FetchDescriptor<MealEntry>())) ?? [] {
                modelContext.delete(m)
            }
            for dto in mealDTOs {
                if let meal = MealEntry(dto: dto, iso8601: iso8601) {
                    modelContext.insert(meal)
                }
            }
        }

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

        if let activityLogDTOs = response.activityLog {
            for x in (try? modelContext.fetch(FetchDescriptor<ActivityLogEntry>())) ?? [] {
                modelContext.delete(x)
            }
            for dto in activityLogDTOs {
                modelContext.insert(ActivityLogEntry(dto: dto, iso8601: iso8601))
            }
        }

        if let metabolicDTO = response.metabolicModel {
            for x in (try? modelContext.fetch(FetchDescriptor<MetabolicModel>())) ?? [] {
                modelContext.delete(x)
            }
            modelContext.insert(MetabolicModel(dto: metabolicDTO, iso8601: iso8601))
        }

        try modelContext.save()

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
            muscleMass: w.muscleMass
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

    // MARK: - Upsert helpers

    private func upsertProfile(_ dto: UserProfileDTO) {
        let id = dto.id
        var descriptor = FetchDescriptor<UserProfile>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1

        if let existing = (try? modelContext.fetch(descriptor))?.first {
            existing.name               = dto.name
            existing.email              = dto.email
            existing.avatarDataUrl      = dto.avatarDataUrl
            existing.age                = dto.age
            existing.weight             = dto.weight
            existing.height             = dto.height
            existing.gender             = Gender(rawValue: dto.gender) ?? existing.gender
            existing.fitnessLevel       = FitnessLevel(rawValue: dto.fitnessLevel) ?? existing.fitnessLevel
            existing.goal               = FitnessGoal(rawValue: dto.goal) ?? existing.goal
            existing.dietaryRestrictions    = dto.dietaryRestrictions ?? existing.dietaryRestrictions
            existing.injuriesOrLimitations  = dto.injuriesOrLimitations ?? existing.injuriesOrLimitations
            existing.dailyActivityLevel = ActivityLevel(rawValue: dto.dailyActivityLevel ?? "") ?? existing.dailyActivityLevel
            existing.unitSystem         = MeasurementSystem(rawValue: dto.unitSystem ?? "") ?? existing.unitSystem
            existing.workoutLocation    = dto.workoutLocation.flatMap { WorkoutLocation(rawValue: $0) }
            existing.workoutEquipment   = (dto.workoutEquipment ?? []).compactMap { WorkoutEquipment(rawValue: $0) }
            existing.workoutDaysPerWeek = dto.workoutDaysPerWeek ?? existing.workoutDaysPerWeek
            existing.workoutTimeframe   = dto.workoutTimeframe.flatMap { WorkoutTimeframe(rawValue: $0) }
            existing.lastSyncedAt       = .now
        } else {
            modelContext.insert(UserProfile(
                id:                     dto.id,
                name:                   dto.name,
                email:                  dto.email,
                avatarDataUrl:          dto.avatarDataUrl,
                age:                    dto.age,
                weight:                 dto.weight,
                height:                 dto.height,
                gender:                 Gender(rawValue: dto.gender) ?? .other,
                fitnessLevel:           FitnessLevel(rawValue: dto.fitnessLevel) ?? .beginner,
                goal:                   FitnessGoal(rawValue: dto.goal) ?? .maintain,
                dietaryRestrictions:    dto.dietaryRestrictions ?? [],
                injuriesOrLimitations:  dto.injuriesOrLimitations ?? [],
                dailyActivityLevel:     ActivityLevel(rawValue: dto.dailyActivityLevel ?? "moderate") ?? .moderate,
                unitSystem:             MeasurementSystem(rawValue: dto.unitSystem ?? "us") ?? .us,
                workoutLocation:        dto.workoutLocation.flatMap { WorkoutLocation(rawValue: $0) },
                workoutEquipment:       (dto.workoutEquipment ?? []).compactMap { WorkoutEquipment(rawValue: $0) },
                workoutDaysPerWeek:     dto.workoutDaysPerWeek ?? 4,
                workoutTimeframe:       dto.workoutTimeframe.flatMap { WorkoutTimeframe(rawValue: $0) },
                lastSyncedAt:           .now
            ))
        }
    }

    private func upsertPlan(_ dto: FitnessPlanDTO) {
        let id = dto.id
        var descriptor = FetchDescriptor<FitnessPlan>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1

        let createdAt = iso8601.date(from: dto.createdAt) ?? .now
        let dietPlan = DietPlan(
            dailyTargets: dto.dietPlan.dailyTargets,
            weeklyPlan:   dto.dietPlan.weeklyPlan,
            tips:         dto.dietPlan.tips
        )
        let workoutPlan = WorkoutPlan(
            weeklyPlan: dto.workoutPlan.weeklyPlan,
            tips:       dto.workoutPlan.tips,
            programWeek1Start: dto.workoutPlan.programWeek1Start
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
                dailyTargets: plan.dietPlan.dailyTargets,
                weeklyPlan:   plan.dietPlan.weeklyPlan,
                tips:         plan.dietPlan.tips
            ),
            workoutPlan: PlanWorkoutPlanDTO(
                weeklyPlan: plan.workoutPlan.weeklyPlan,
                tips:       plan.workoutPlan.tips,
                programWeek1Start: plan.workoutPlan.programWeek1Start
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
