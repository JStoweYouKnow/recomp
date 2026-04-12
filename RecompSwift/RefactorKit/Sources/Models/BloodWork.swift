import Foundation
import SwiftData

public struct BloodWorkMarker: Codable, Identifiable, Sendable {
    public var id: String { name }
    public var name: String
    public var value: Double
    public var unit: String
    public var normalRange: NormalRange
    public var status: BloodWorkStatus

    public struct NormalRange: Codable, Sendable {
        public var low: Double
        public var high: Double

        public init(low: Double, high: Double) {
            self.low = low
            self.high = high
        }
    }
}

@Model
public final class BloodWork: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var date: String
    public var markers: [BloodWorkMarker]
    public var notes: String?

    public init(
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
