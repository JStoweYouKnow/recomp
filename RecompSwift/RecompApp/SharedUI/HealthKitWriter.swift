import Foundation
import HealthKit
import RefactorKit

/// Writes logged nutrition and completed workouts to Apple Health. Gated behind a user
/// toggle (`healthKitWriteEnabled`) so nothing is exported unless the user opts in. All
/// writes are best-effort and silently no-op when unavailable or unauthorized.
enum HealthKitWriter {
    static let enabledKey = "healthKitWriteEnabled"

    private static let store = HKHealthStore()

    private static var nutritionTypes: [HKQuantityTypeIdentifier] {
        [.dietaryEnergyConsumed, .dietaryProtein, .dietaryCarbohydrates, .dietaryFatTotal]
    }

    static var shareTypes: Set<HKSampleType> {
        var set = Set<HKSampleType>()
        for id in nutritionTypes {
            if let type = HKQuantityType.quantityType(forIdentifier: id) { set.insert(type) }
        }
        set.insert(HKObjectType.workoutType())
        return set
    }

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    static var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: enabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    /// Requests share authorization for nutrition + workouts. Returns false on any failure.
    @discardableResult
    static func requestAuthorization() async -> Bool {
        guard isAvailable else { return false }
        do {
            try await store.requestAuthorization(toShare: shareTypes, read: [])
            return true
        } catch {
            return false
        }
    }

    // MARK: - Nutrition

    static func saveMeal(name: String, macros: Macros, date: Date) {
        guard isEnabled, isAvailable else { return }
        var samples: [HKSample] = []
        func add(_ id: HKQuantityTypeIdentifier, unit: HKUnit, value: Double) {
            guard value > 0, let type = HKQuantityType.quantityType(forIdentifier: id) else { return }
            guard store.authorizationStatus(for: type) == .sharingAuthorized else { return }
            let sample = HKQuantitySample(
                type: type,
                quantity: HKQuantity(unit: unit, doubleValue: value),
                start: date,
                end: date,
                metadata: [HKMetadataKeyFoodType: name]
            )
            samples.append(sample)
        }
        add(.dietaryEnergyConsumed, unit: .kilocalorie(), value: Double(macros.calories))
        add(.dietaryProtein, unit: .gram(), value: macros.protein)
        add(.dietaryCarbohydrates, unit: .gram(), value: macros.carbs)
        add(.dietaryFatTotal, unit: .gram(), value: macros.fat)
        guard !samples.isEmpty else { return }
        store.save(samples) { _, _ in }
    }

    // MARK: - Workout

    static func saveWorkout(focus: String, start: Date, end: Date) async {
        guard isEnabled, isAvailable else { return }
        guard store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else { return }
        guard end > start else { return }

        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
        do {
            try await builder.beginCollection(at: start)
            try await builder.addMetadata([HKMetadataKeyWorkoutBrandName: "Recomp — \(focus)"])
            try await builder.endCollection(at: end)
            _ = try await builder.finishWorkout()
        } catch {
            // Best-effort; ignore failures.
        }
    }
}
