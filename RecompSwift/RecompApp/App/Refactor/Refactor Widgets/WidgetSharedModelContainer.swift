import SwiftData
import RefactorKit

/// Single shared `ModelContainer` for the widget extension (same App Group store as iOS + watch).
enum WidgetSharedModelContainer {
    static let shared: ModelContainer = {
        do {
            return try RefactorSchema.makeContainerNonisolated(
                appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier
            )
        } catch {
            print("RecompWidgetsExtension: SwiftData store failed (\(error)); using in-memory.")
            return try! RefactorSchema.makeContainerNonisolated(inMemory: true)
        }
    }()
}
