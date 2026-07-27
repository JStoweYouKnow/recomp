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
            // Never delete the shared App Group store from an extension — the main app may
            // have it open and concurrent deletion corrupts SQLite.
            Logger(subsystem: "com.refactor.ios", category: "SwiftData")
                .error("RecompWidgetsExtension: shared store failed to open (\(error, privacy: .public)); using in-memory fallback.")
            do {
                return try RefactorSchema.makeContainerNonisolated(inMemory: true)
            } catch {
                fatalError("Widget SwiftData store could not start: \(error)")
            }
        }
    }()
}
