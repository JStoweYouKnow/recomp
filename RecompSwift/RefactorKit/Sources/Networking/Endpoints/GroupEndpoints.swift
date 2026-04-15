import Foundation

public enum GroupAPI: APIEndpoint {
    case list
    case create(payload: CreateGroupPayload)
    case discover
    case joinByCode(code: String)
    case detail(id: String)
    case messages(groupId: String)
    case sendMessage(groupId: String, text: String)
    case pinMessage(groupId: String, messageId: String)
    case unpinMessage(groupId: String, messageId: String)
    case progress(groupId: String)
    case updateProgress(groupId: String, payload: ProgressUpdatePayload)
    case leave(groupId: String)

    public var path: String {
        switch self {
        case .list, .create: return "/api/groups"
        case .discover: return "/api/groups/discover"
        case .joinByCode: return "/api/groups/join-by-code"
        case .detail(let id): return "/api/groups/\(id)"
        case .messages(let id), .sendMessage(let id, _): return "/api/groups/\(id)/messages"
        case .pinMessage(let gid, let mid): return "/api/groups/\(gid)/messages/\(mid)/pin"
        case .unpinMessage(let gid, let mid): return "/api/groups/\(gid)/messages/\(mid)/unpin"
        case .progress(let id), .updateProgress(let id, _): return "/api/groups/\(id)/progress"
        case .leave(let id): return "/api/groups/\(id)/leave"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .list, .discover, .detail, .messages, .progress: return .GET
        case .create, .joinByCode, .sendMessage, .pinMessage, .unpinMessage, .updateProgress, .leave: return .POST
        }
    }

    public var body: (any Encodable)? {
        switch self {
        case .create(let payload): return AnyEncodable(payload)
        case .joinByCode(let code): return AnyEncodable(["code": code])
        case .sendMessage(_, let text): return AnyEncodable(["text": text])
        case .updateProgress(_, let payload): return AnyEncodable(payload)
        default: return nil
        }
    }
}

public struct CreateGroupPayload: Encodable {
    public let name: String
    public let description: String
    public let goalType: String
    public let goalDescription: String?
    public let accessMode: String
    public let trackingMode: String

    public init(
        name: String,
        description: String,
        goalType: String,
        goalDescription: String?,
        accessMode: String,
        trackingMode: String
    ) {
        self.name = name
        self.description = description
        self.goalType = goalType
        self.goalDescription = goalDescription
        self.accessMode = accessMode
        self.trackingMode = trackingMode
    }
}

public struct ProgressUpdatePayload: Encodable {
    let xp: Int
    let streakLength: Int
    let macroHitRate: Double
}

public struct ChallengeProgressPayload: Encodable {
    let challengeId: String
    let score: Double
}

public struct ChallengeJoinPayload: Encodable {
    let challengeId: String
}

public enum ChallengeAPI: APIEndpoint {
    case list
    case create(payload: CreateChallengePayload)
    case join(id: String)
    case leave(id: String)
    case progress(id: String, score: Double)

    public var path: String {
        switch self {
        case .list: return "/api/challenges"
        case .create: return "/api/challenges/create"
        case .join: return "/api/challenges/join"
        case .leave: return "/api/challenges/leave"
        case .progress: return "/api/challenges/progress"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .list: return .GET
        default: return .POST
        }
    }

    public var body: (any Encodable)? {
        switch self {
        case .create(let payload): return AnyEncodable(payload)
        case .join(let id): return AnyEncodable(ChallengeJoinPayload(challengeId: id))
        case .leave(let id): return AnyEncodable(ChallengeJoinPayload(challengeId: id))
        case .progress(let id, let score): return AnyEncodable(ChallengeProgressPayload(challengeId: id, score: score))
        default: return nil
        }
    }
}

public struct CreateChallengePayload: Encodable, Sendable {
    public let type: String
    public let title: String
    public let description: String
    public let metric: String
    public let target: Double
    public let startDate: String
    public let endDate: String
    public let stakes: String?
    public let groupId: String?

    public init(
        type: String,
        title: String,
        description: String,
        metric: String,
        target: Double,
        startDate: String,
        endDate: String,
        stakes: String?,
        groupId: String?
    ) {
        self.type = type
        self.title = title
        self.description = description
        self.metric = metric
        self.target = target
        self.startDate = startDate
        self.endDate = endDate
        self.stakes = stakes
        self.groupId = groupId
    }
}

// MARK: - JSON DTOs (SwiftData @Model types are not Decodable)

public struct GroupDTO: Decodable, Sendable {
    public let id: String
    public let name: String
    public let description: String
    public let goalType: GroupGoalType
    public let goalDescription: String?
    public let accessMode: GroupAccessMode
    public let trackingMode: GroupTrackingMode
    public let inviteCode: String?
    public let creatorId: String
    public let memberCount: Int
    public let createdAt: Date
}

extension GroupDTO {
    public func toModel() -> Group {
        Group(
            id: id,
            name: name,
            descriptionText: description,
            goalType: goalType,
            goalDescription: goalDescription,
            accessMode: accessMode,
            trackingMode: trackingMode,
            inviteCode: inviteCode,
            creatorId: creatorId,
            memberCount: memberCount,
            createdAt: createdAt
        )
    }
}

public struct GroupMembershipDTO: Decodable, Sendable {
    public let groupId: String
    public let groupName: String
    public let role: GroupRole
    public let joinedAt: Date
}

extension GroupMembershipDTO {
    public func toModel() -> GroupMembership {
        GroupMembership(groupId: groupId, groupName: groupName, role: role, joinedAt: joinedAt)
    }
}

public struct GroupMessageDTO: Decodable, Sendable {
    public let id: String
    public let authorId: String
    public let authorName: String
    public let authorAvatarUrl: String?
    public let text: String
    public let createdAt: Date
    public let pinnedAt: Date?
}

extension GroupMessageDTO {
    public func toModel(groupId: String) -> GroupMessage {
        GroupMessage(
            id: id,
            groupId: groupId,
            authorId: authorId,
            authorName: authorName,
            authorAvatarUrl: authorAvatarUrl,
            text: text,
            createdAt: createdAt,
            pinnedAt: pinnedAt
        )
    }
}

/// `GET /api/groups/:id` returns `{ group, members }`.
public struct GroupDetailResponseDTO: Decodable, Sendable {
    public let group: GroupDTO
    public let members: [GroupMembershipDTO]
}

public struct ChallengeDTO: Decodable, Sendable {
    public let id: String
    public let type: ChallengeType
    public let title: String
    public let description: String
    public let metric: ChallengeMetric
    public let target: Double
    public let startDate: String
    public let endDate: String
    public let stakes: String?
    public let participants: [ChallengeParticipant]
    public let status: ChallengeStatus
    public let createdBy: String
    public let groupId: String?
}

extension ChallengeDTO {
    public func toModel() -> Challenge {
        Challenge(
            id: id,
            type: type,
            title: title,
            descriptionText: description,
            metric: metric,
            target: target,
            startDate: startDate,
            endDate: endDate,
            stakes: stakes,
            participants: participants,
            status: status,
            createdBy: createdBy,
            groupId: groupId
        )
    }
}
