import Foundation
import SwiftData

/// Keeps App Group `ricoHistoryJSON` aligned with SwiftData coach messages for sync push.
public enum CoachHistoryStore {
    private static let maxEntries = 100
    private static let maxContentLength = 10_000

    public static func mergeIntoDefaults(container: ModelContainer) {
        guard let dtos = historyDTOs(from: container), !dtos.isEmpty else { return }
        if let data = try? JSONEncoder().encode(dtos) {
            RecompAppGroupDefaults.shared.set(data, forKey: RecompUserDefaultsKeys.ricoHistoryJSON)
        }
    }

    public static func historyForPush(container: ModelContainer) -> [RicoMessageDTO]? {
        if let dtos = historyDTOs(from: container), !dtos.isEmpty {
            return dtos
        }
        guard let data = RecompAppGroupDefaults.shared.data(forKey: RecompUserDefaultsKeys.ricoHistoryJSON),
              let decoded = try? JSONDecoder().decode([RicoMessageDTO].self, from: data),
              !decoded.isEmpty
        else { return nil }
        return decoded
    }

    private static func historyDTOs(from container: ModelContainer) -> [RicoMessageDTO]? {
        let fresh = ModelContext(container)
        let descriptor = FetchDescriptor<CoachMessage>(
            sortBy: [SortDescriptor(\.timestamp)]
        )
        let messages = (try? fresh.fetch(descriptor)) ?? []
        guard !messages.isEmpty else { return nil }
        let iso = ISO8601DateFormatter()
        return messages.suffix(maxEntries).map { msg in
            RicoMessageDTO(
                role: msg.role == .user ? "user" : "assistant",
                content: String(msg.content.prefix(maxContentLength)),
                at: iso.string(from: msg.timestamp)
            )
        }
    }
}
