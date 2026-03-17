import Foundation
import SwiftData

@Model
final class Milestone: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var milestoneType: MilestoneType
    var earnedAt: Date
    var progress: Double?

    init(milestoneType: MilestoneType, earnedAt: Date = .now, progress: Double? = nil) {
        self.id = milestoneType.rawValue
        self.milestoneType = milestoneType
        self.earnedAt = earnedAt
        self.progress = progress
    }
}
