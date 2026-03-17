import Foundation
import SwiftData

@Model
final class Group: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var name: String
    var descriptionText: String
    var goalType: GroupGoalType
    var goalDescription: String?
    var accessMode: GroupAccessMode
    var trackingMode: GroupTrackingMode
    var inviteCode: String?
    var creatorId: String
    var memberCount: Int
    var createdAt: Date

    init(
        id: String = UUID().uuidString,
        name: String,
        descriptionText: String,
        goalType: GroupGoalType,
        goalDescription: String? = nil,
        accessMode: GroupAccessMode = .open,
        trackingMode: GroupTrackingMode = .both,
        inviteCode: String? = nil,
        creatorId: String,
        memberCount: Int = 1,
        createdAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.descriptionText = descriptionText
        self.goalType = goalType
        self.goalDescription = goalDescription
        self.accessMode = accessMode
        self.trackingMode = trackingMode
        self.inviteCode = inviteCode
        self.creatorId = creatorId
        self.memberCount = memberCount
        self.createdAt = createdAt
    }
}

@Model
final class GroupMembership: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var groupId: String
    var groupName: String
    var role: GroupRole
    var joinedAt: Date

    init(groupId: String, groupName: String, role: GroupRole, joinedAt: Date = .now) {
        self.id = groupId
        self.groupId = groupId
        self.groupName = groupName
        self.role = role
        self.joinedAt = joinedAt
    }
}

@Model
final class GroupMessage: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var groupId: String
    var authorId: String
    var authorName: String
    var authorAvatarUrl: String?
    var text: String
    var createdAt: Date
    var pinnedAt: Date?

    init(
        id: String = UUID().uuidString,
        groupId: String,
        authorId: String,
        authorName: String,
        authorAvatarUrl: String? = nil,
        text: String,
        createdAt: Date = .now,
        pinnedAt: Date? = nil
    ) {
        self.id = id
        self.groupId = groupId
        self.authorId = authorId
        self.authorName = authorName
        self.authorAvatarUrl = authorAvatarUrl
        self.text = text
        self.createdAt = createdAt
        self.pinnedAt = pinnedAt
    }
}

struct GroupMemberProgress: Codable, Identifiable, Sendable {
    var userId: String
    var name: String
    var avatarDataUrl: String?
    var xp: Int
    var xpLevel: Int
    var streakLength: Int
    var weeksActive: Int
    var macroHitRate: Double
    var updatedAt: String

    var id: String { userId }
}
