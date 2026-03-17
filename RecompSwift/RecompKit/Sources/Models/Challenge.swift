import Foundation
import SwiftData

struct ChallengeParticipant: Codable, Identifiable, Hashable, Sendable {
    var userId: String
    var name: String
    var progress: Double
    var score: Double

    var id: String { userId }
}

@Model
final class Challenge: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var type: ChallengeType
    var title: String
    var descriptionText: String
    var metric: ChallengeMetric
    var target: Double
    var startDate: String
    var endDate: String
    var stakes: String?
    var participants: [ChallengeParticipant]
    var status: ChallengeStatus
    var createdBy: String
    var groupId: String?

    init(
        id: String = UUID().uuidString,
        type: ChallengeType,
        title: String,
        descriptionText: String,
        metric: ChallengeMetric,
        target: Double,
        startDate: String,
        endDate: String,
        stakes: String? = nil,
        participants: [ChallengeParticipant] = [],
        status: ChallengeStatus = .pending,
        createdBy: String,
        groupId: String? = nil
    ) {
        self.id = id
        self.type = type
        self.title = title
        self.descriptionText = descriptionText
        self.metric = metric
        self.target = target
        self.startDate = startDate
        self.endDate = endDate
        self.stakes = stakes
        self.participants = participants
        self.status = status
        self.createdBy = createdBy
        self.groupId = groupId
    }
}
