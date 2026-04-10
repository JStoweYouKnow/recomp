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
    let name: String
    let description: String
    let goalType: String
    let goalDescription: String?
    let accessMode: String
    let trackingMode: String
}

public struct ProgressUpdatePayload: Encodable {
    let xp: Int
    let streakLength: Int
    let macroHitRate: Double
}

public enum ChallengeAPI: APIEndpoint {
    case list
    case create(payload: CreateChallengePayload)
    case join(id: String)
    case progress(id: String, score: Double)

    public var path: String {
        switch self {
        case .list: return "/api/challenges"
        case .create: return "/api/challenges/create"
        case .join: return "/api/challenges/join"
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
        case .join(let id): return AnyEncodable(["challengeId": id])
        case .progress(let id, let score): return AnyEncodable(["challengeId": id, "score": score])
        default: return nil
        }
    }
}

public struct CreateChallengePayload: Encodable {
    let type: String
    let title: String
    let description: String
    let metric: String
    let target: Double
    let startDate: String
    let endDate: String
    let stakes: String?
    let groupId: String?
}
