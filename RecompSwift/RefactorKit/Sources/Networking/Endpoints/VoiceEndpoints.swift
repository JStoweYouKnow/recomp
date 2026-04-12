import Foundation

public enum VoiceAPI: APIEndpoint {
    case parse(text: String)
    case sonicStream
    case onboardingExtract(text: String)

    public var path: String {
        switch self {
        case .parse: return "/api/voice/parse"
        case .sonicStream: return "/api/voice/sonic/stream"
        case .onboardingExtract: return "/api/onboarding/voice-extract"
        }
    }

    public var method: HTTPMethod { .POST }

    public var body: (any Encodable)? {
        switch self {
        case .parse(let text):
            return AnyEncodable(["text": text])
        case .onboardingExtract(let text):
            return AnyEncodable(["text": text])
        default:
            return nil
        }
    }
}

public struct VoiceParseResponse: Decodable {
    let meals: [SuggestedMeal]?
    let text: String?
}
