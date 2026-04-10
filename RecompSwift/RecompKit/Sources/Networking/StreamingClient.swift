import Foundation

public struct VoiceStreamResponse: Decodable {
    let type: String?
    let text: String?
    let audio: String?
    let done: Bool?
}

public actor StreamingClient {
    private let session: URLSession
    private let decoder = JSONDecoder()

    public init() {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 60
        self.session = URLSession(configuration: config)
    }

    public func streamNDJSON<T: Decodable>(
        url: URL,
        body: Data?,
        as type: T.Type
    ) -> AsyncThrowingStream<T, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = body

                    let (bytes, response) = try await session.bytes(for: request)

                    if let httpResponse = response as? HTTPURLResponse,
                       !(200...299).contains(httpResponse.statusCode) {
                        continuation.finish(throwing: APIError.invalidResponse(httpResponse.statusCode))
                        return
                    }

                    for try await line in bytes.lines {
                        guard !line.isEmpty else { continue }
                        guard let data = line.data(using: .utf8) else { continue }

                        do {
                            let decoded = try decoder.decode(T.self, from: data)
                            continuation.yield(decoded)
                        } catch {
                            continue
                        }
                    }

                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    public func uploadAudioStream(
        url: URL,
        audioData: Data,
        contentType: String = "audio/wav"
    ) -> AsyncThrowingStream<VoiceStreamResponse, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    let boundary = UUID().uuidString
                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

                    var body = Data()
                    body.append("--\(boundary)\r\n".data(using: .utf8)!)
                    body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"recording.wav\"\r\n".data(using: .utf8)!)
                    body.append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
                    body.append(audioData)
                    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
                    request.httpBody = body

                    let (bytes, response) = try await session.bytes(for: request)

                    if let httpResponse = response as? HTTPURLResponse,
                       !(200...299).contains(httpResponse.statusCode) {
                        continuation.finish(throwing: APIError.invalidResponse(httpResponse.statusCode))
                        return
                    }

                    for try await line in bytes.lines {
                        guard !line.isEmpty, let data = line.data(using: .utf8) else { continue }

                        if let decoded = try? decoder.decode(VoiceStreamResponse.self, from: data) {
                            continuation.yield(decoded)
                            if decoded.done == true { break }
                        }
                    }

                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }
}
