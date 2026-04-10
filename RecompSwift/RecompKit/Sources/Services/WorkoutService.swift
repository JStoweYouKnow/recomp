import Foundation
import Observation

@MainActor
@Observable
public final class WorkoutService {
    private(set) var exerciseResults: [ExerciseSearchResult] = []
    private(set) var isSearching = false
    public var workoutProgress: [String: Set<String>] = [:]

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func searchExercises(name: String) async throws {
        isSearching = true
        defer { isSearching = false }

        exerciseResults = try await api.request(WorkoutAPI.exerciseSearch(name: name))
    }

    public func getExerciseGifURL(id: String) async throws -> URL? {
        let result: ExerciseSearchResult = try await api.request(WorkoutAPI.exerciseGif(id: id))
        guard let urlString = result.gifUrl else { return nil }
        return URL(string: urlString)
    }

    public func markSetComplete(exerciseName: String, setIndex: Int) {
        let key = exerciseName
        if workoutProgress[key] == nil {
            workoutProgress[key] = []
        }
        workoutProgress[key]?.insert("set_\(setIndex)")
    }

    public func isSetComplete(exerciseName: String, setIndex: Int) -> Bool {
        workoutProgress[exerciseName]?.contains("set_\(setIndex)") ?? false
    }

    public func resetDayProgress() {
        workoutProgress.removeAll()
    }

    public func assessRecovery(biofeedback: [String: Int]) async throws -> RecoveryAssessment {
        return try await api.request(
            WorkoutAPI.recoveryAdjust(payload: RecoveryPayload(biofeedback: biofeedback, wearableData: nil))
        )
    }
}
