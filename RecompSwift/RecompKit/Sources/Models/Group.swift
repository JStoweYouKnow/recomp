import Foundation
import SwiftData

@Model
public final class Group: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var name: String
    public var descriptionText: String
    public var goalType: GroupGoalType
    public var goalDescription: String?
    public var accessMode: GroupAccessMode
    public var trackingMode: GroupTrackingMode
    public var inviteCode: String?
    public var creatorId: String
    public var memberCount: Int
    public var createdAt: Date

    public init(
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
public final class GroupMembership: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var groupId: String
    public var groupName: String
    public var role: GroupRole
    public var joinedAt: Date

    public init(groupId: String, groupName: String, role: GroupRole, joinedAt: Date = .now) {
        self.id = groupId
        self.groupId = groupId
        self.groupName = groupName
        self.role = role
        self.joinedAt = joinedAt
    }
}

@Model
public final class GroupMessage: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var groupId: String
    public var authorId: String
    public var authorName: String
    public var authorAvatarUrl: String?
    public var text: String
    public var createdAt: Date
    public var pinnedAt: Date?

    public init(
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

public struct GroupMemberProgress: Codable, Identifiable, Sendable {
    public var userId: String
    public var name: String
    public var avatarDataUrl: String?
    public var xp: Int
    public var xpLevel: Int
    public var streakLength: Int
    public var weeksActive: Int
    public var macroHitRate: Double
    public var updatedAt: String

    public var id: String { userId }
}
