import Foundation

/// Tombstones for meals removed locally until the server acknowledges the delete.
public enum PendingMealDeletions {
    private static let defaults = RecompAppGroupDefaults.shared
    private static var key: String { RecompUserDefaultsKeys.pendingMealDeletionsJSON }

    public struct Entry: Codable, Sendable, Equatable {
        public var id: String
        public var date: String

        public init(id: String, date: String) {
            self.id = id
            self.date = DateHelpers.calendarDay(from: date)
        }
    }

    public static func record(id: String, date: String) {
        var entries = load()
        let entry = Entry(id: id, date: date)
        if !entries.contains(entry) {
            entries.append(entry)
        }
        save(Array(entries.suffix(500)))
    }

    public static func load() -> [Entry] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
    }

    public static func clear(_ acked: [Entry]) {
        guard !acked.isEmpty else { return }
        let keys = Set(acked.map { "\($0.date)#\($0.id)" })
        let remaining = load().filter { !keys.contains("\($0.date)#\($0.id)") }
        save(remaining)
    }

    private static func save(_ entries: [Entry]) {
        if entries.isEmpty {
            defaults.removeObject(forKey: key)
            return
        }
        if let data = try? JSONEncoder().encode(entries) {
            defaults.set(data, forKey: key)
        }
    }
}
