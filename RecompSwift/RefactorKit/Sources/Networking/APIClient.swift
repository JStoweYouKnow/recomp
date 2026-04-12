import Foundation

public enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse(Int)
    case decodingError(Error)
    case networkError(Error)
    case unauthorized
    case serverError(String)
    case noData

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse(let code): return "Server returned status \(code)"
        case .decodingError(let err): return "Failed to decode: \(err.localizedDescription)"
        case .networkError(let err): return err.localizedDescription
        case .unauthorized: return "Session expired. Please log in again."
        case .serverError(let msg): return msg
        case .noData: return "No data received"
        }
    }
}

public actor APIClient {
    public static let shared = APIClient()

    private let session: URLSession
    private let baseURL: URL
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
            self.baseURL = url
        } else {
            self.baseURL = URL(string: "https://recomp.app")!
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
        try validateResponse(response)
        return try decode(data)
    }

    public func requestVoid(_ endpoint: APIEndpoint) async throws {
        let request = try buildRequest(for: endpoint)
        let (_, response) = try await perform(request)
        try validateResponse(response)
    }

    public func requestRaw(_ endpoint: APIEndpoint) async throws -> Data {
        let request = try buildRequest(for: endpoint)
        let (data, response) = try await perform(request)
        try validateResponse(response)
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
        try validateResponse(response)
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
                    try validateResponse(httpResponse)

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

        // Native clients often do not send the httpOnly session cookie reliably; the API
        // accepts the same user id via header (see recomp `getUserId` + `X-Refactor-User-Id`).
        if let uid = try? KeychainService.loadUserId(), !uid.isEmpty {
            request.setValue(uid, forHTTPHeaderField: "X-Refactor-User-Id")
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
        } catch {
            throw APIError.networkError(error)
        }
    }

    private func validateResponse(_ response: HTTPURLResponse) throws {
        switch response.statusCode {
        case 200...299: return
        case 401: throw APIError.unauthorized
        default: throw APIError.invalidResponse(response.statusCode)
        }
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}
