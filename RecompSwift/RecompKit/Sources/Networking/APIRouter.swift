import Foundation

public enum HTTPMethod: String {
    case GET, POST, PUT, DELETE, PATCH
}

public protocol APIEndpoint {
    public var path: String { get }
    public var method: HTTPMethod { get }
    public var queryItems: [URLQueryItem]? { get }
    public var body: (any Encodable)? { get }
}

extension APIEndpoint {
    public var queryItems: [URLQueryItem]? { nil }
    public var body: (any Encodable)? { nil }

    public func url(relativeTo baseURL: URL) -> URL? {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: true)
        components?.queryItems = queryItems
        return components?.url
    }
}

public struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void

    init<T: Encodable>(_ value: T) {
        _encode = value.encode
    }

    public func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}
