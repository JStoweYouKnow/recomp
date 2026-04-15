import Foundation

/// Local cache for the adaptive TDEE card (mirrors web `localStorage` / `saveMetabolicModel`).
public enum MetabolicModelStorage {
    private static let key = "recomp_metabolic_model_cache_v1"

    public struct CachedModel: Codable, Sendable, Equatable {
        public var estimatedTDEE: Double
        public var confidence: Int
        public var lastUpdated: String?
        public var dataPointCount: Int

        public init(estimatedTDEE: Double, confidence: Int, lastUpdated: String?, dataPointCount: Int) {
            self.estimatedTDEE = estimatedTDEE
            self.confidence = confidence
            self.lastUpdated = lastUpdated
            self.dataPointCount = dataPointCount
        }
    }

    public static func load() -> CachedModel? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(CachedModel.self, from: data)
    }

    public static func save(_ model: MetabolicModelResponse, dataPointCount: Int) {
        let cached = CachedModel(
            estimatedTDEE: model.estimatedTDEE,
            confidence: model.confidence,
            lastUpdated: model.lastUpdated,
            dataPointCount: dataPointCount
        )
        if let data = try? JSONEncoder().encode(cached) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    public static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
