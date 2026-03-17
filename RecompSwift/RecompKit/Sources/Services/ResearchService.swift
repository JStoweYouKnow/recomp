import Foundation

@MainActor
@Observable
final class ResearchService {
    private(set) var result: ResearchResponse?
    private(set) var isSearching = false

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    func search(query: String) async throws {
        isSearching = true
        defer { isSearching = false }

        result = try await api.request(ResearchAPI.search(query: query))
    }

    func clearResults() {
        result = nil
    }
}
