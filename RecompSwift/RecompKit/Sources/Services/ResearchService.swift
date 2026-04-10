import Foundation
import Observation

@MainActor
@Observable
public final class ResearchService {
    private(set) var result: ResearchResponse?
    private(set) var isSearching = false

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func search(query: String) async throws {
        isSearching = true
        defer { isSearching = false }

        result = try await api.request(ResearchAPI.search(query: query))
    }

    public func clearResults() {
        result = nil
    }
}
