import SwiftData
import RefactorKit
import OSLog

/// Single shared `ModelContainer` for the widget extension (same App Group store as iOS + watch).
enum WidgetSharedModelContainer {
    static let shared: ModelContainer = {
        do {
            return try RefactorSchema.makeContainerNonisolated(
                appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier
            )
        } catch {
            Logger(subsystem: "com.refactor.ios", category: "SwiftData")
                .error("RecompWidgetsExtension: shared store failed to open (\(error, privacy: .public)); using a temporary in-memory store.")
            do {
                return try RefactorSchema.makeContainerNonisolated(inMemory: true)
            } catch {
                // In-memory creation should never fail; if it does the widget can't render data.
                fatalError("Widget SwiftData store could not start: \(error)")
            }
        }
    }()
}
