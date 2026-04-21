import Foundation
import WatchConnectivity
import RefactorKit

/// Receives the userId pushed from the paired iPhone and stores it so the watch
/// SyncEngine can authenticate API requests via `X-Refactor-User-Id`.
final class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        // Apply any context that arrived while the watch app was not running.
        applyContext(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        applyContext(applicationContext)
    }

    private func applyContext(_ context: [String: Any]) {
        guard let userId = context["userId"] as? String, !userId.isEmpty else { return }
        RecompAppGroupDefaults.shared.set(userId, forKey: RecompUserDefaultsKeys.userId)
        // Signal the watch app to do a full pull from the server now that we have a userId.
        NotificationCenter.default.post(name: .recompWatchDidReceiveUserId, object: nil)
    }
}
