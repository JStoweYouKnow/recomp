import Foundation
import SwiftData

/// Macro dashboard state pushed from iPhone → Watch (App Group + WCSession).
/// Ensures the watch face matches the phone dashboard even when SwiftData cross-process refresh lags.
public struct WatchDashboardSnapshot: Codable, Equatable {
    public let date: String
    public let syncAt: TimeInterval
    public let caloriesConsumed: Int
    public let caloriesTarget: Int
    public let proteinConsumed: Double
    public let proteinTarget: Double
    public let carbsConsumed: Double
    public let carbsTarget: Double
    public let fatConsumed: Double
    public let fatTarget: Double
    public let activityCalorieAdjustment: Int

    public init(
        date: String,
        syncAt: TimeInterval,
        caloriesConsumed: Int,
        caloriesTarget: Int,
        proteinConsumed: Double,
        proteinTarget: Double,
        carbsConsumed: Double,
        carbsTarget: Double,
        fatConsumed: Double,
        fatTarget: Double,
        activityCalorieAdjustment: Int
    ) {
        self.date = date
        self.syncAt = syncAt
        self.caloriesConsumed = caloriesConsumed
        self.caloriesTarget = caloriesTarget
        self.proteinConsumed = proteinConsumed
        self.proteinTarget = proteinTarget
        self.carbsConsumed = carbsConsumed
        self.carbsTarget = carbsTarget
        self.fatConsumed = fatConsumed
        self.fatTarget = fatTarget
        self.activityCalorieAdjustment = activityCalorieAdjustment
    }

    public var consumed: Macros {
        Macros(
            calories: caloriesConsumed,
            protein: proteinConsumed,
            carbs: carbsConsumed,
            fat: fatConsumed
        )
    }

    public var macroTargets: Macros {
        Macros(
            calories: max(0, caloriesTarget - activityCalorieAdjustment),
            protein: proteinTarget,
            carbs: carbsTarget,
            fat: fatTarget
        )
    }

    public func wcsContextPayload(userId: String, apiToken: String?) -> [String: Any] {
        var payload: [String: Any] = [
            "userId": userId,
            "syncAt": syncAt,
            "snapshotDate": date,
            "caloriesConsumed": caloriesConsumed,
            "caloriesTarget": caloriesTarget,
            "proteinConsumed": proteinConsumed,
            "proteinTarget": proteinTarget,
            "carbsConsumed": carbsConsumed,
            "carbsTarget": carbsTarget,
            "fatConsumed": fatConsumed,
            "fatTarget": fatTarget,
            "activityCalorieAdjustment": activityCalorieAdjustment,
        ]
        if let apiToken, !apiToken.isEmpty {
            payload["apiToken"] = apiToken
        }
        return payload
    }
}

public enum WatchDashboardSnapshotStore {
    public static let defaultsKey = "recomp_watch_dashboard_snapshot_v1"

    public static func save(_ snapshot: WatchDashboardSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        RecompAppGroupDefaults.shared.set(data, forKey: defaultsKey)
        NotificationCenter.default.post(name: .recompWatchDashboardSnapshotUpdated, object: nil)
    }

    public static func load(for date: String = DateHelpers.todayString()) -> WatchDashboardSnapshot? {
        guard let data = RecompAppGroupDefaults.shared.data(forKey: defaultsKey),
              let snapshot = try? JSONDecoder().decode(WatchDashboardSnapshot.self, from: data),
              snapshot.date == date
        else { return nil }
        return snapshot
    }

    /// Build from WCSession `applicationContext` keys (property-list types only).
    public static func from(context: [String: Any]) -> WatchDashboardSnapshot? {
        guard let date = context["snapshotDate"] as? String else { return nil }
        let syncAt = (context["syncAt"] as? Double) ?? (context["syncAt"] as? TimeInterval)
        guard let syncAt else { return nil }

        func int(_ key: String) -> Int? {
            if let v = context[key] as? Int { return v }
            if let v = context[key] as? Double { return Int(v) }
            if let v = context[key] as? NSNumber { return v.intValue }
            return nil
        }
        func double(_ key: String) -> Double? {
            if let v = context[key] as? Double { return v }
            if let v = context[key] as? Int { return Double(v) }
            if let v = context[key] as? NSNumber { return v.doubleValue }
            return nil
        }

        guard let caloriesConsumed = int("caloriesConsumed"),
              let caloriesTarget = int("caloriesTarget"),
              let proteinConsumed = double("proteinConsumed"),
              let proteinTarget = double("proteinTarget"),
              let carbsConsumed = double("carbsConsumed"),
              let carbsTarget = double("carbsTarget"),
              let fatConsumed = double("fatConsumed"),
              let fatTarget = double("fatTarget")
        else { return nil }

        let activityAdj = int("activityCalorieAdjustment") ?? 0
        return WatchDashboardSnapshot(
            date: date,
            syncAt: syncAt,
            caloriesConsumed: caloriesConsumed,
            caloriesTarget: caloriesTarget,
            proteinConsumed: proteinConsumed,
            proteinTarget: proteinTarget,
            carbsConsumed: carbsConsumed,
            carbsTarget: carbsTarget,
            fatConsumed: fatConsumed,
            fatTarget: fatTarget,
            activityCalorieAdjustment: activityAdj
        )
    }
}

@MainActor
public enum WatchDashboardSnapshotPublisher {
    /// Computes the same numbers as iOS `DashboardView` and mirrors them to the watch.
    public static func publish(from context: ModelContext) {
        let mealService = MealService()
        let planService = PlanService()
        let consumed = mealService.todaysMacros(context: context)
        let targets = planService.todaysTargets(context: context)
        let activityAdj = mealService.todaysActivityCalorieAdjustment(context: context)
        let adjustedCalorieTarget = targets.calories + activityAdj

        let snapshot = WatchDashboardSnapshot(
            date: DateHelpers.todayString(),
            syncAt: Date().timeIntervalSince1970,
            caloriesConsumed: consumed.calories,
            caloriesTarget: adjustedCalorieTarget,
            proteinConsumed: consumed.protein,
            proteinTarget: targets.protein,
            carbsConsumed: consumed.carbs,
            carbsTarget: targets.carbs,
            fatConsumed: consumed.fat,
            fatTarget: targets.fat,
            activityCalorieAdjustment: activityAdj
        )
        WatchDashboardSnapshotStore.save(snapshot)
    }
}

public struct WatchDashboardMetrics {
    public let consumed: Macros
    public let targets: Macros
    public let adjustedCalorieTarget: Int
}

@MainActor
public enum WatchDashboardMetricsResolver {
    /// Prefer the phone-pushed snapshot when the local watch store is behind; otherwise use SwiftData.
    public static func resolve(context: ModelContext) -> WatchDashboardMetrics {
        let mealService = MealService()
        let planService = PlanService()
        let localConsumed = mealService.todaysMacros(context: context)
        let localTargets = planService.todaysTargets(context: context)
        let activityAdj = mealService.todaysActivityCalorieAdjustment(context: context)
        let localAdjustedTarget = localTargets.calories + activityAdj

        guard let snap = WatchDashboardSnapshotStore.load() else {
            return WatchDashboardMetrics(
                consumed: localConsumed,
                targets: localTargets,
                adjustedCalorieTarget: localAdjustedTarget
            )
        }

        if localConsumed.calories >= snap.caloriesConsumed {
            return WatchDashboardMetrics(
                consumed: localConsumed,
                targets: localTargets,
                adjustedCalorieTarget: localAdjustedTarget
            )
        }

        return WatchDashboardMetrics(
            consumed: snap.consumed,
            targets: snap.macroTargets,
            adjustedCalorieTarget: snap.caloriesTarget
        )
    }
}
