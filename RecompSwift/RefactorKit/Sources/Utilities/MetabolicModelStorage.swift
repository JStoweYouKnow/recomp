import Foundation

/// Local cache for the adaptive TDEE card (mirrors web `localStorage` / `saveMetabolicModel`).
public enum MetabolicModelStorage {
    private static let key = "recomp_metabolic_model_cache_v1"

    public struct CachedHistoryEntry: Codable, Sendable, Equatable {
        public var date: String
        public var tdee: Double
        public var confidence: Int
    }

    public struct CachedModel: Codable, Sendable, Equatable {
        public var estimatedTDEE: Double
        public var confidence: Int
        public var lastUpdated: String?
        public var dataPointCount: Int
        public var history: [CachedHistoryEntry]

        public init(estimatedTDEE: Double, confidence: Int, lastUpdated: String?, dataPointCount: Int, history: [CachedHistoryEntry] = []) {
            self.estimatedTDEE = estimatedTDEE
            self.confidence = confidence
            self.lastUpdated = lastUpdated
            self.dataPointCount = dataPointCount
            self.history = history
        }
    }

    public static func load() -> CachedModel? {
        guard let data = RecompAppGroupDefaults.shared.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(CachedModel.self, from: data)
    }

    public static func save(_ model: MetabolicModelResponse, dataPointCount: Int) {
        let cached = CachedModel(
            estimatedTDEE: model.estimatedTDEE,
            confidence: model.confidence,
            lastUpdated: model.lastUpdated,
            dataPointCount: dataPointCount,
            history: model.history.map { CachedHistoryEntry(date: $0.date, tdee: $0.tdee, confidence: $0.confidence) }
        )
        if let data = try? JSONEncoder().encode(cached) {
            RecompAppGroupDefaults.shared.set(data, forKey: key)
        }
    }

    public static func clear() {
        RecompAppGroupDefaults.shared.removeObject(forKey: key)
    }
}
