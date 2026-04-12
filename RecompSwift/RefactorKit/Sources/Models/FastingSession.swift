import Foundation
import SwiftData

@Model
public final class FastingSession: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var startTime: Date
    public var endTime: Date?
    public var targetHours: Int
    public var fastingProtocol: FastingProtocol

    public init(
        id: String = UUID().uuidString,
        startTime: Date = .now,
        endTime: Date? = nil,
        targetHours: Int = 16,
        fastingProtocol: FastingProtocol = .sixteenEight
    ) {
        self.id = id
        self.startTime = startTime
        self.endTime = endTime
        self.targetHours = targetHours
        self.fastingProtocol = fastingProtocol
    }

    public var isActive: Bool { endTime == nil }

    public var elapsedHours: Double {
        let end = endTime ?? .now
        return end.timeIntervalSince(startTime) / 3600
    }

    public var progress: Double {
        min(elapsedHours / Double(targetHours), 1.0)
    }

    public var currentPhase: FastingPhase {
        let hours = elapsedHours
        if hours < 4 { return .fed }
        if hours < 12 { return .earlyFasting }
        if hours < 18 { return .fatBurning }
        if hours < 24 { return .ketosis }
        return .deepKetosis
    }
}
