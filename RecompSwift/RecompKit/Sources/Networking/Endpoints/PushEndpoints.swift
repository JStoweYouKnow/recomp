import Foundation

public enum PushAPI: APIEndpoint {
    case subscribeExpo(token: String)
    case unsubscribeExpo(token: String)
    case status

    public var path: String {
        switch self {
        case .subscribeExpo: return "/api/push/subscribe-expo"
        case .unsubscribeExpo: return "/api/push/unsubscribe-expo"
        case .status: return "/api/push/status"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .status: return .GET
        default: return .POST
        }
    }

    public var body: (any Encodable)? {
        switch self {
        case .subscribeExpo(let token): return AnyEncodable(["token": token])
        case .unsubscribeExpo(let token): return AnyEncodable(["token": token])
        default: return nil
        }
    }
}

public enum MiscAPI: APIEndpoint {
    case dataSync(payload: SyncPayload)
    case dataFetch
    case weeklyReview(payload: WeeklyReviewPayload)
    case imageGenerate(prompt: String)
    case videoGenerate(scans: [String])
    case metabolicUpdate(payload: MetabolicUpdatePayload)
    case biofeedbackInsights(entries: [[String: Int]])
    case bloodworkParse
    case bodyScanProgressReel(scanIds: [String])
    case musicSuggest(mood: String?, genre: String?)
    case supplementsAnalyze(supplements: [String])
    case macrosCalculate(profile: UserProfileDTO)
    case mealPrepGenerate(preferences: [String: String])
    case mealPrepGroceryList(recipes: [String])
    case calendarToken
    case calendarFeed(token: String)
    case cookingConnect(provider: String)
    case cookingImport
    case feedbackSubmit(rating: Int?, text: String)

    public var path: String {
        switch self {
        case .dataSync, .dataFetch: return "/api/data/sync"
        case .weeklyReview: return "/api/agent/weekly-review"
        case .imageGenerate: return "/api/images/generate"
        case .videoGenerate: return "/api/video/generate"
        case .metabolicUpdate: return "/api/metabolic/update"
        case .biofeedbackInsights: return "/api/biofeedback/insights"
        case .bloodworkParse: return "/api/bloodwork/parse"
        case .bodyScanProgressReel: return "/api/body-scan/progress-reel"
        case .musicSuggest: return "/api/music/suggest"
        case .supplementsAnalyze: return "/api/supplements/analyze"
        case .macrosCalculate: return "/api/macros/calculate"
        case .mealPrepGenerate: return "/api/meal-prep/generate"
        case .mealPrepGroceryList: return "/api/meal-prep/grocery-list"
        case .calendarToken: return "/api/calendar/token"
        case .calendarFeed: return "/api/calendar/feed"
        case .cookingConnect: return "/api/cooking/connect"
        case .cookingImport: return "/api/cooking/import"
        case .feedbackSubmit: return "/api/feedback"
        }
    }

    public var method: HTTPMethod {
        switch self {
        case .dataFetch, .calendarFeed: return .GET
        default: return .POST
        }
    }

    public var queryItems: [URLQueryItem]? {
        switch self {
        case .calendarFeed(let token):
            return [URLQueryItem(name: "token", value: token)]
        default:
            return nil
        }
    }

    public var body: (any Encodable)? {
        switch self {
        case .dataSync(let payload): return AnyEncodable(payload)
        case .weeklyReview(let payload): return AnyEncodable(payload)
        case .imageGenerate(let prompt): return AnyEncodable(["prompt": prompt])
        case .videoGenerate(let scans): return AnyEncodable(["scanIds": scans])
        case .metabolicUpdate(let payload): return AnyEncodable(payload)
        case .biofeedbackInsights(let entries): return AnyEncodable(["entries": entries])
        case .bodyScanProgressReel(let ids): return AnyEncodable(["scanIds": ids])
        case .musicSuggest(let mood, let genre): return AnyEncodable(MusicSuggestPayload(mood: mood, genre: genre))
        case .supplementsAnalyze(let supps): return AnyEncodable(["supplements": supps])
        case .macrosCalculate(let profile): return AnyEncodable(profile)
        case .mealPrepGenerate(let prefs): return AnyEncodable(prefs)
        case .mealPrepGroceryList(let recipes): return AnyEncodable(["recipes": recipes])
        case .cookingConnect(let provider): return AnyEncodable(["provider": provider])
        case .feedbackSubmit(let rating, let text): return AnyEncodable(FeedbackPayload(rating: rating, text: text))
        default: return nil
        }
    }
}

public struct SyncPayload: Encodable, Sendable {
    let profile: UserProfileDTO?
    let meals: [[String: String]]?
    let plan: FitnessPlanDTO?
    let milestones: [[String: String]]?
}

public struct WeeklyReviewPayload: Encodable {
    let meals: [[String: String]]
    let wearableData: [[String: String]]?
    let profile: UserProfileDTO
}

public struct MetabolicUpdatePayload: Encodable {
    let weightKg: Double
    let totalIntake: Double
    let date: String
}

public struct MusicSuggestPayload: Encodable {
    let mood: String?
    let genre: String?
}

public struct FeedbackPayload: Encodable {
    let rating: Int?
    let text: String
}

public struct ImageGenerateResponse: Decodable {
    let imageUrl: String?
    let imageBase64: String?
}
