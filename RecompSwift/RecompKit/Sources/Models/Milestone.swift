import Foundation
import SwiftData

@Model
public final class Milestone: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var milestoneType: MilestoneType
    public var earnedAt: Date
    public var progress: Double?

    public init(milestoneType: MilestoneType, earnedAt: Date = .now, progress: Double? = nil) {
        self.id = milestoneType.rawValue
        self.milestoneType = milestoneType
        self.earnedAt = earnedAt
        self.progress = progress
    }
}
