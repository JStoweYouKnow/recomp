import Foundation

public enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse(Int)
    case decodingError(Error)
    case networkError(Error)
    case unauthorized
    case serverError(String)
    case noData
    case offline

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse(let code): return "Server returned status \(code)"
        case .decodingError(let err): return "Failed to decode: \(err.localizedDescription)"
        case .networkError(let err): return err.localizedDescription
        case .unauthorized: return "Session expired. Please log in again."
        case .serverError(let msg): return msg
        case .noData: return "No data received"
        case .offline: return "You appear to be offline. Check your connection and try again."
        }
    }

    /// True when the failure is a transport/connectivity problem rather than an
    /// authentication or server-logic failure. Used to avoid signing users out
    /// (or wiping state) merely because the network is unavailable.
    public var isConnectivityFailure: Bool {
        switch self {
        case .offline, .networkError: return true
        default: return false
        }
    }
}

public actor APIClient {
    public static let shared = APIClient()

    private let session: URLSession
    public nonisolated let baseURL: URL
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    public init(baseURL: URL? = nil) {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300

        self.session = URLSession(configuration: config)

        if let baseURL {
            self.baseURL = baseURL
        } else if let envURL = ProcessInfo.processInfo.environment["RECOMP_API_URL"],
                  let url = URL(string: envURL) {
            // Set RECOMP_API_URL in the Xcode scheme's environment variables to override.
            self.baseURL = url
        } else {
            // Default must match production docs + Android (`recomp-one`); override with RECOMP_API_URL for other stacks.
            self.baseURL = URL(string: "https://recomp-one.vercel.app")!
        }

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Core Request Methods

    public func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T {
        let request = try buildRequest(for: endpoint)
        let (data, response) = try await perform(request)
        try validateResponse(response, data: data)
        return try decode(data)
    }

    public func requestVoid(_ endpoint: APIEndpoint) async throws {
        let request = try buildRequest(for: endpoint)
        let (data, response) = try await perform(request)
        try validateResponse(response, data: data)
    }

    public func requestRaw(_ endpoint: APIEndpoint) async throws -> Data {
        let request = try buildRequest(for: endpoint)
        let (data, response) = try await perform(request)
        try validateResponse(response, data: data)
        return data
    }

    /// Fetches raw bytes from an arbitrary URL with the standard auth header attached.
    /// Used for proxied media (e.g. exercise GIFs) that require the same session credentials
    /// as JSON endpoints but can't receive headers through a WKWebView img tag.
    public func requestRawURL(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        if let uid = try? KeychainService.loadUserId(), !uid.isEmpty {
            request.setValue(uid, forHTTPHeaderField: "X-Refactor-User-Id")
        }
        let (data, response) = try await perform(request)
        try validateResponse(response, data: data)
        return data
    }

    public func upload<T: Decodable>(
        _ endpoint: APIEndpoint,
        imageData: Data,
        fieldName: String = "image",
        fileName: String = "photo.jpg",
        mimeType: String = "image/jpeg"
    ) async throws -> T {
        var request = try buildRequest(for: endpoint)

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await perform(request)
        try validateResponse(response, data: data)
        return try decode(data)
    }

    public func stream(_ endpoint: APIEndpoint) -> AsyncThrowingStream<Data, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = try buildRequest(for: endpoint)
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let httpResponse = response as? HTTPURLResponse else {
                        continuation.finish(throwing: APIError.invalidResponse(0))
                        return
                    }
                    try validateResponse(httpResponse, data: Data())

                    for try await line in bytes.lines {
                        guard !line.isEmpty else { continue }
                        if let data = line.data(using: .utf8) {
                            continuation.yield(data)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Internals

    private func buildRequest(for endpoint: APIEndpoint) throws -> URLRequest {
        guard let url = endpoint.url(relativeTo: baseURL) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body = endpoint.body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        // Prefer a verified API token (Bearer) over the session cookie alone.
        // The previous X-Refactor-User-Id raw-header approach is removed — it accepted
        // an arbitrary user ID with no verification, allowing trivial account impersonation.
        if let token = KeychainService.loadApiToken(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        return request
    }

    private func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse(0)
            }
            return (data, httpResponse)
        } catch let error as APIError {
            throw error
        } catch let urlError as URLError where urlError.code == .cannotConnectToHost
                                              || urlError.code == .networkConnectionLost
                                              || urlError.code == .notConnectedToInternet
                                              || urlError.code == .timedOut
                                              || urlError.code == .dataNotAllowed {
            // Connectivity failure — distinct from auth/server errors so callers can
            // keep the user signed in on cached data instead of forcing re-login.
            throw APIError.offline
        } catch {
            throw APIError.networkError(error)
        }
    }

    private func validateResponse(_ response: HTTPURLResponse, data: Data) throws {
        switch response.statusCode {
        case 200...299: return
        case 401:
            // Signal session expiry app-wide so AuthService can clear credentials and
            // route to sign-in. Posted for every 401 regardless of body shape.
            NotificationCenter.default.post(name: .recompSessionExpired, object: nil)
            // Prefer the server's own message before the generic "Session expired" copy.
            if let msg = parseErrorMessage(from: data) {
                throw APIError.serverError(msg)
            }
            throw APIError.unauthorized
        default:
            if let msg = parseErrorMessage(from: data) {
                throw APIError.serverError(msg)
            }
            throw APIError.invalidResponse(response.statusCode)
        }
    }

    /// Reads `{ "error": "..." }` or `{ "message": "..." }` from a JSON error body.
    private func parseErrorMessage(from data: Data) -> String? {
        guard !data.isEmpty,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return (json["error"] as? String) ?? (json["message"] as? String)
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}
