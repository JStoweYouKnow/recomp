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
                .error("RecompWidgetsExtension: shared store failed to open (\(error, privacy: .public)); attempting recovery.")
            RefactorSchema.deleteStore(appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier)
            do {
                return try RefactorSchema.makeContainerNonisolated(
                    appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier
                )
            } catch {
                Logger(subsystem: "com.refactor.ios", category: "SwiftData")
                    .error("RecompWidgetsExtension: recovery failed (\(error, privacy: .public)); using a temporary in-memory store.")
                do {
                    return try RefactorSchema.makeContainerNonisolated(inMemory: true)
                } catch {
                    fatalError("Widget SwiftData store could not start: \(error)")
                }
            }
        }
    }()
}
