import Foundation
import SwiftData
import Observation

@MainActor
@Observable
public final class GroupService {
    private(set) var myGroups: [GroupMembership] = []
    private(set) var discoverGroups: [Group] = []
    private(set) var currentGroup: Group?
    private(set) var messages: [GroupMessage] = []
    private(set) var leaderboard: [GroupMemberProgress] = []
    private(set) var challenges: [Challenge] = []
    private(set) var isLoading = false

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func fetchMyGroups() async throws {
        isLoading = true
        defer { isLoading = false }
        myGroups = try await api.request(GroupAPI.list)
    }

    public func fetchDiscoverGroups() async throws {
        discoverGroups = try await api.request(GroupAPI.discover)
    }

    public func createGroup(_ payload: CreateGroupPayload) async throws -> Group {
        let group: Group = try await api.request(GroupAPI.create(payload: payload))
        try await fetchMyGroups()
        return group
    }

    public func joinByCode(_ code: String) async throws {
        try await api.requestVoid(GroupAPI.joinByCode(code: code))
        try await fetchMyGroups()
    }

    public func fetchGroupDetail(id: String) async throws {
        currentGroup = try await api.request(GroupAPI.detail(id: id))
    }

    public func fetchMessages(groupId: String) async throws {
        messages = try await api.request(GroupAPI.messages(groupId: groupId))
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
        challenges = try await api.request(ChallengeAPI.list)
    }

    public func createChallenge(_ payload: CreateChallengePayload) async throws {
        try await api.requestVoid(ChallengeAPI.create(payload: payload))
        try await fetchChallenges()
    }

    public func joinChallenge(id: String) async throws {
        try await api.requestVoid(ChallengeAPI.join(id: id))
        try await fetchChallenges()
    }
}
