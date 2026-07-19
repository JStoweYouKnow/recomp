import Foundation
import os.log

public struct RicoSkippedAction: Sendable {
    public let type: String
    public let reason: String

    public init(type: String, reason: String) {
        self.type = type
        self.reason = reason
    }
}

public struct RicoApplyResult: Sendable {
    public var applied: [String] = []
    public var skipped: [RicoSkippedAction] = []
    public var touchedMeals = false
    public var touchedPlan = false
    public var shouldRegeneratePlan = false
    public var pendingRegenerateOptions = RegeneratePlanOptions.default

    public var hasLocalChanges: Bool { touchedMeals || touchedPlan }

    public var statusSuffix: String? {
        var parts: [String] = []
        if !applied.isEmpty {
            parts.append("Applied \(applied.count) change(s).")
        }
        if !skipped.isEmpty {
            let detail = skipped.map { "\($0.type) (\($0.reason))" }.joined(separator: "; ")
            parts.append("Ref couldn't apply: \(detail)")
        }
        guard !parts.isEmpty else { return nil }
        return "\n\n" + parts.joined(separator: " ")
    }

    public mutating func recordApplied(_ type: String) {
        applied.append(type)
    }

    public mutating func recordSkipped(type: String, reason: String) {
        skipped.append(RicoSkippedAction(type: type, reason: reason))
    }
}
