import Foundation
import SwiftData

@Model
final class Supplement: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var name: String
    var dosage: String
    var frequency: SupplementFrequency
    var timing: SupplementTiming
    var takenToday: Bool

    init(
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
