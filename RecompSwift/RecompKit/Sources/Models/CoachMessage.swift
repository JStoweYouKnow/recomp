import Foundation
import SwiftData

@Model
final class CoachMessage: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var role: CoachMessageRole
    var content: String
    var timestamp: Date

    init(
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

struct CoachSchedule: Codable, Sendable {
    var checkInTimes: [String]
    var lastCheckIn: String?
    var confrontations: [Confrontation]
    var weeklyReviewDay: Int

    struct Confrontation: Codable, Identifiable, Sendable {
        var id: String
        var date: String
        var pattern: String
        var message: String
        var acknowledged: Bool
    }
}
