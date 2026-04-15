import Foundation
import SwiftData
import Observation

@MainActor
@Observable
public final class GroupService {
    public private(set) var myGroups: [GroupMembership] = []
    public private(set) var discoverGroups: [Group] = []
    public private(set) var currentGroup: Group?
    public private(set) var messages: [GroupMessage] = []
    public private(set) var leaderboard: [GroupMemberProgress] = []
    public private(set) var challenges: [Challenge] = []
    public private(set) var isLoading = false

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func fetchMyGroups() async throws {
        isLoading = true
        defer { isLoading = false }
        let dtos: [GroupMembershipDTO] = try await api.request(GroupAPI.list)
        myGroups = dtos.map { $0.toModel() }
    }

    public func fetchDiscoverGroups() async throws {
        let dtos: [GroupDTO] = try await api.request(GroupAPI.discover)
        discoverGroups = dtos.map { $0.toModel() }
    }

    public func createGroup(_ payload: CreateGroupPayload) async throws -> Group {
        let dto: GroupDTO = try await api.request(GroupAPI.create(payload: payload))
        let group = dto.toModel()
        try await fetchMyGroups()
        return group
    }

    public func joinByCode(_ code: String) async throws {
        try await api.requestVoid(GroupAPI.joinByCode(code: code))
        try await fetchMyGroups()
    }

    public func fetchGroupDetail(id: String) async throws {
        let detail: GroupDetailResponseDTO = try await api.request(GroupAPI.detail(id: id))
        currentGroup = detail.group.toModel()
    }

    public func fetchMessages(groupId: String) async throws {
        let dtos: [GroupMessageDTO] = try await api.request(GroupAPI.messages(groupId: groupId))
        messages = dtos.map { $0.toModel(groupId: groupId) }
    }

    public func sendMessage(groupId: String, text: String) async throws {
        try await api.requestVoid(GroupAPI.sendMessage(groupId: groupId, text: text))
        try await fetchMessages(groupId: groupId)
    }

    public func pinMessage(groupId: String, messageId: String) async throws {
        try await api.requestVoid(GroupAPI.pinMessage(groupId: groupId, messageId: messageId))
    }

    public func unpinMessage(groupId: String, messageId: String) async throws {
        try await api.requestVoid(GroupAPI.unpinMessage(groupId: groupId, messageId: messageId))
    }

    public func fetchLeaderboard(groupId: String) async throws {
        leaderboard = try await api.request(GroupAPI.progress(groupId: groupId))
    }

    public func leaveGroup(groupId: String) async throws {
        try await api.requestVoid(GroupAPI.leave(groupId: groupId))
        try await fetchMyGroups()
    }

    public func fetchChallenges() async throws {
        let dtos: [ChallengeDTO] = try await api.request(ChallengeAPI.list)
        challenges = dtos.map { $0.toModel() }
    }

    public func createChallenge(_ payload: CreateChallengePayload) async throws {
        try await api.requestVoid(ChallengeAPI.create(payload: payload))
        try await fetchChallenges()
    }

    public func joinChallenge(id: String) async throws {
        try await api.requestVoid(ChallengeAPI.join(id: id))
        try await fetchChallenges()
    }

    public func leaveChallenge(id: String) async throws {
        try await api.requestVoid(ChallengeAPI.leave(id: id))
        try await fetchChallenges()
    }
}
