import SwiftUI

private enum SyncEngineEnvironmentKey: EnvironmentKey {
    static let defaultValue: SyncEngine? = nil
}

extension EnvironmentValues {
    /// Injected by the iOS / watchOS app after creating a `SyncEngine` for the shared `ModelContainer`.
    public var syncEngine: SyncEngine? {
        get { self[SyncEngineEnvironmentKey.self] }
        set { self[SyncEngineEnvironmentKey.self] = newValue }
    }
}
