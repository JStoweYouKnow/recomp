import Foundation
import SwiftData

@Model
public final class CoachMessage: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var role: CoachMessageRole
    public var content: String
    public var timestamp: Date

    public init(
        id: String = UUID().uuidString,
        role: CoachMessageRole,
        content: String,
        timestamp: Date = .now
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
    }
}

public struct CoachSchedule: Codable, Sendable {
    public var checkInTimes: [String]
    public var lastCheckIn: String?
    public var confrontations: [Confrontation]
    public var weeklyReviewDay: Int

    struct Confrontation: Codable, Identifiable, Sendable {
        var id: String
        var date: String
        var pattern: String
        var message: String
        var acknowledged: Bool
    }
}
