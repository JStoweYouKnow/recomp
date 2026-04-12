import Foundation
import SwiftData

@Model
public final class Supplement: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var name: String
    public var dosage: String
    public var frequency: SupplementFrequency
    public var timing: SupplementTiming
    public var takenToday: Bool

    public init(
        id: String = UUID().uuidString,
        name: String,
        dosage: String,
        frequency: SupplementFrequency = .daily,
        timing: SupplementTiming = .morning,
        takenToday: Bool = false
    ) {
        self.id = id
        self.name = name
        self.dosage = dosage
        self.frequency = frequency
        self.timing = timing
        self.takenToday = takenToday
    }
}
