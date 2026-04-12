import Foundation
import SwiftData

public struct ChallengeParticipant: Codable, Identifiable, Hashable, Sendable {
    public var userId: String
    public var name: String
    public var progress: Double
    public var score: Double

    public var id: String { userId }
}

@Model
public final class Challenge: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var type: ChallengeType
    public var title: String
    public var descriptionText: String
    public var metric: ChallengeMetric
    public var target: Double
    public var startDate: String
    public var endDate: String
    public var stakes: String?
    public var participants: [ChallengeParticipant]
    public var status: ChallengeStatus
    public var createdBy: String
    public var groupId: String?

    public init(
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
