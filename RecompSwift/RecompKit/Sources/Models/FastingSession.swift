import Foundation
import SwiftData

@Model
final class FastingSession: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var startTime: Date
    var endTime: Date?
    var targetHours: Int
    var fastingProtocol: FastingProtocol

    init(
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

    var isActive: Bool { endTime == nil }

    var elapsedHours: Double {
        let end = endTime ?? .now
        return end.timeIntervalSince(startTime) / 3600
    }

    var progress: Double {
        min(elapsedHours / Double(targetHours), 1.0)
    }

    var currentPhase: FastingPhase {
        let hours = elapsedHours
        if hours < 4 { return .fed }
        if hours < 12 { return .earlyFasting }
        if hours < 18 { return .fatBurning }
        if hours < 24 { return .ketosis }
        return .deepKetosis
    }
}
