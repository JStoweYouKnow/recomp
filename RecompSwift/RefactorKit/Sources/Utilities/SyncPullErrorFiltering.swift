import Foundation

/// Treats benign cancellation (pull-to-refresh dismissed, preempted Tasks) as non-errors for user alerts.
public enum SyncPullErrorFiltering {
    public static func shouldSuppressUserAlert(for error: Error) -> Bool {
        if error is CancellationError { return true }
        if let api = error as? APIError {
            switch api {
            case .networkError(let inner), .decodingError(let inner):
                return shouldSuppressUserAlert(for: inner)
            default:
                return false
            }
        }
        if let urlErr = error as? URLError, urlErr.code == .cancelled { return true }
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return true }
        return false
    }
}
