import Foundation
import SwiftData

@Model
final class HydrationEntry: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var date: String
    var time: String
    var amountMl: Int
    var source: HydrationSource

    init(
        id: String = UUID().uuidString,
        date: String,
        time: String,
        amountMl: Int,
        source: HydrationSource = .water
    ) {
        self.id = id
        self.date = date
        self.time = time
        self.amountMl = amountMl
        self.source = source
    }

    var amountOz: Double { Double(amountMl) / 29.5735 }
}
