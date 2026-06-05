import Foundation
import Testing
@testable import RefactorKit

// MARK: - E. APIError.isConnectivityFailure

@Test func isConnectivityFailure_trueForTransportFailures() {
    #expect(APIError.offline.isConnectivityFailure)
    let urlError = URLError(.notConnectedToInternet)
    #expect(APIError.networkError(urlError).isConnectivityFailure)
}

@Test func isConnectivityFailure_falseForAuthAndServerFailures() {
    #expect(!APIError.unauthorized.isConnectivityFailure)
    #expect(!APIError.serverError("x").isConnectivityFailure)
    #expect(!APIError.invalidResponse(500).isConnectivityFailure)
}
