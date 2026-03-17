import Foundation
import SwiftData

struct BloodWorkMarker: Codable, Identifiable, Sendable {
    var id: String { name }
    var name: String
    var value: Double
    var unit: String
    var normalRange: NormalRange
    var status: BloodWorkStatus

    struct NormalRange: Codable, Sendable {
        var low: Double
        var high: Double
    }
}

@Model
final class BloodWork: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var date: String
    var markers: [BloodWorkMarker]
    var notes: String?

    init(
        id: String = UUID().uuidString,
        date: String,
        markers: [BloodWorkMarker] = [],
        notes: String? = nil
    ) {
        self.id = id
        self.date = date
        self.markers = markers
        self.notes = notes
    }
}
