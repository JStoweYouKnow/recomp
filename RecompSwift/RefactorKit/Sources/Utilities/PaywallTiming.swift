import Foundation
import SwiftData

/// Decides *when* the subscription sheet is allowed to appear.
///
/// Presenting it the instant a user authenticates put a purchase decision in front of
/// someone who had not yet seen a plan, logged a meal, or watched the coach do anything.
/// Refactor's aha moment is unusually concrete and fast — a personalised program in under
/// a minute — so the paywall waits for it.
public enum PaywallTiming {
    private static let lastPresentedKey = "recomp_paywall_last_presented_at"
    private static let sessionCountKey = "recomp_paywall_session_count"

    /// Minimum gap between automatic presentations, so declining once doesn't mean
    /// being asked again on the next foreground.
    private static let minimumInterval: TimeInterval = 60 * 60 * 24 * 3

    private static var defaults: UserDefaults { RecompAppGroupDefaults.shared }

    /// Call once per app launch, after auth resolves.
    public static func recordSession() {
        defaults.set(sessionCount + 1, forKey: sessionCountKey)
    }

    public static var sessionCount: Int {
        defaults.integer(forKey: sessionCountKey)
    }

    /// True when the user has something worth paying for and hasn't been asked recently.
    ///
    /// Conditions, all required:
    /// 1. A plan exists — they have seen the product's core output.
    /// 2. This is at least their second session — the first is for using it, not buying.
    /// 3. The sheet hasn't been shown in the last few days.
    @MainActor
    public static func shouldPresent(context: ModelContext) -> Bool {
        guard hasGeneratedPlan(context: context) else { return false }
        guard sessionCount >= 2 else { return false }
        return intervalElapsed
    }

    public static var intervalElapsed: Bool {
        let last = defaults.double(forKey: lastPresentedKey)
        guard last > 0 else { return true }
        return Date().timeIntervalSince1970 - last >= minimumInterval
    }

    public static func markPresented() {
        defaults.set(Date().timeIntervalSince1970, forKey: lastPresentedKey)
    }

    /// Clears the timing state — call on sign-out so the next account starts fresh.
    public static func reset() {
        defaults.removeObject(forKey: lastPresentedKey)
        defaults.removeObject(forKey: sessionCountKey)
    }

    @MainActor
    private static func hasGeneratedPlan(context: ModelContext) -> Bool {
        var descriptor = FetchDescriptor<FitnessPlan>()
        descriptor.fetchLimit = 1
        return ((try? context.fetch(descriptor))?.isEmpty == false)
    }
}
