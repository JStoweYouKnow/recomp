import Foundation
import SwiftData

@Model
public final class HydrationEntry: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var date: String
    public var time: String
    public var amountMl: Int
    public var source: HydrationSource

    public init(
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

    public var amountOz: Double { Double(amountMl) / 29.5735 }
}
