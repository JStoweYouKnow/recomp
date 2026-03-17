import Foundation

enum VoiceAPI: APIEndpoint {
    case parse(text: String)
    case sonicStream
    case onboardingExtract(text: String)

    var path: String {
        switch self {
        case .parse: return "/api/voice/parse"
        case .sonicStream: return "/api/voice/sonic/stream"
        case .onboardingExtract: return "/api/onboarding/voice-extract"
        }
    }

    var method: HTTPMethod { .POST }

    var body: (any Encodable)? {
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

struct VoiceParseResponse: Decodable {
    let meals: [SuggestedMeal]?
    let text: String?
}
