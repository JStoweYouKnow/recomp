import Foundation
import WatchConnectivity
import RefactorKit

/// Pushes the authenticated userId to the paired Apple Watch via WCSession.
/// Uses `applicationContext` so the watch receives it even when not currently reachable.
final class PhoneSessionManager: NSObject, WCSessionDelegate {
    static let shared = PhoneSessionManager()

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Call after every successful sign-in or session check.
    func pushUserId() {
        pushSessionContext(snapshot: WatchDashboardSnapshotStore.load())
    }

    /// Call after iPhone sync completes so the watch pulls fresh meals/macros from the server.
    func pushDataRefresh(snapshot: WatchDashboardSnapshot? = WatchDashboardSnapshotStore.load()) {
        pushSessionContext(snapshot: snapshot)
    }

    private func pushSessionContext(snapshot: WatchDashboardSnapshot?) {
        guard WCSession.isSupported(),
              WCSession.default.activationState == .activated,
              WCSession.default.isWatchAppInstalled,
              let userId = try? KeychainService.loadUserId(),
              !userId.isEmpty
        else { return }

        let token = KeychainService.loadApiToken()
        let payload: [String: Any]
        if let snapshot {
            payload = snapshot.wcsContextPayload(userId: userId, apiToken: token)
        } else {
            var base: [String: Any] = [
                "userId": userId,
                "syncAt": Date().timeIntervalSince1970,
            ]
            if let token, !token.isEmpty {
                base["apiToken"] = token
            }
            payload = base
        }
        try? WCSession.default.updateApplicationContext(payload)
    }

    /// Call on logout so the paired watch clears its cached session instead of
    /// continuing to show the previous account's data.
    func clearUserId() {
        guard WCSession.isSupported(),
              WCSession.default.activationState == .activated
        else { return }
        try? WCSession.default.updateApplicationContext(["userId": "", "signedOut": true])
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated { pushUserId() }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }
}
