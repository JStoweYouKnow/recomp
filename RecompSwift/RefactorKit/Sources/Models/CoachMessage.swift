import Foundation
import SwiftData

@Model
public final class CoachMessage: @unchecked Sendable {
    @Attribute(.unique) public var id: String
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

    public struct Confrontation: Codable, Identifiable, Sendable {
        public var id: String
        public var date: String
        public var pattern: String
        public var message: String
        public var acknowledged: Bool

        public init(id: String, date: String, pattern: String, message: String, acknowledged: Bool) {
            self.id = id
            self.date = date
            self.pattern = pattern
            self.message = message
            self.acknowledged = acknowledged
        }
    }
}
