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
        case .parse(let transcript):
            return AnyEncodable(["transcript": transcript])
        case .onboardingExtract(let text):
            return AnyEncodable(["text": text])
        default:
            return nil
        }
    }
}

/// Decodes `POST /api/voice/parse` which may return either a flat meal (`name` + macro fields, as in the web app)
/// or a richer `{ "meals": [SuggestedMeal], "text": ... }` shape.
public struct VoiceParseResponse: Decodable, Sendable {
    public let meals: [SuggestedMeal]?
    public let text: String?

    private enum CodingKeys: String, CodingKey {
        case meals, text, name, description, mealType, calories, protein, carbs, fat
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decodeIfPresent(String.self, forKey: .text)

        if let nested = try c.decodeIfPresent([SuggestedMeal].self, forKey: .meals), !nested.isEmpty {
            meals = nested
            return
        }

        if let name = try c.decodeIfPresent(String.self, forKey: .name), !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let calories = Int((try c.decodeIfPresent(Double.self, forKey: .calories) ?? 0).rounded())
            let protein = try c.decodeIfPresent(Double.self, forKey: .protein) ?? 0
            let carbs = try c.decodeIfPresent(Double.self, forKey: .carbs) ?? 0
            let fat = try c.decodeIfPresent(Double.self, forKey: .fat) ?? 0
            let macros = Macros(calories: calories, protein: protein, carbs: carbs, fat: fat)
            let description = try c.decodeIfPresent(String.self, forKey: .description)
            let mealType = try c.decodeIfPresent(String.self, forKey: .mealType)
            meals = [SuggestedMeal(name: name, description: description, macros: macros, mealType: mealType)]
            return
        }

        meals = try c.decodeIfPresent([SuggestedMeal].self, forKey: .meals)
    }
}
