import Foundation
import WatchConnectivity
import RefactorKit

/// Receives the userId pushed from the paired iPhone and stores it so the watch
/// SyncEngine can authenticate API requests via Bearer token + App Group userId.
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
        applyContext(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        applyContext(applicationContext)
    }

    private func applyContext(_ context: [String: Any]) {
        if (context["signedOut"] as? Bool) == true {
            try? KeychainService.delete()
            RecompAppGroupDefaults.shared.removeObject(forKey: RecompUserDefaultsKeys.userId)
            return
        }

        if let token = context["apiToken"] as? String, !token.isEmpty {
            RecompAppGroupDefaults.shared.set(token, forKey: RecompUserDefaultsKeys.apiToken)
            try? KeychainService.saveApiToken(token)
        }

        if let userId = context["userId"] as? String, !userId.isEmpty {
            RecompAppGroupDefaults.shared.set(userId, forKey: RecompUserDefaultsKeys.userId)
        }

        if let snapshot = WatchDashboardSnapshotStore.from(context: context) {
            WatchDashboardSnapshotStore.save(snapshot)
        }

        let shouldRefresh = context["userId"] != nil || context["syncAt"] != nil || context["snapshotDate"] != nil
        guard shouldRefresh else { return }
        NotificationCenter.default.post(name: .recompWatchShouldRefresh, object: nil)
    }
}
