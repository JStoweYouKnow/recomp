import Foundation
import SwiftData

@Model
public final class FitnessPlan: @unchecked Sendable {
    @Attribute(.unique) public var id: String
    public var userId: String
    public var createdAt: Date
    public var dietPlan: DietPlan
    public var workoutPlan: WorkoutPlan
    public var reasoning: String?
    public var synced: Bool

    public init(
        id: String = UUID().uuidString,
        userId: String,
        createdAt: Date = .now,
        dietPlan: DietPlan,
        workoutPlan: WorkoutPlan,
        reasoning: String? = nil,
        synced: Bool = false
    ) {
        self.id = id
        self.userId = userId
        self.createdAt = createdAt
        self.dietPlan = dietPlan
        self.workoutPlan = workoutPlan
        self.reasoning = reasoning
        self.synced = synced
    }
}

public struct DietPlan: Codable, Sendable {
    public var dailyTargets: Macros
    public var trainingTargets: Macros?
    public var restTargets: Macros?
    /// Mon–Sun targets in `WeekdayMacroKey.allCases` order (SwiftData-safe; sync maps to `weekdayTargets` JSON).
    public var weekdayTargetList: [Macros]?
    public var weeklyPlan: [DietDay]
    public var tips: [String]

    public init(
        dailyTargets: Macros,
        trainingTargets: Macros? = nil,
        restTargets: Macros? = nil,
        weekdayTargetList: [Macros]? = nil,
        weeklyPlan: [DietDay] = [],
        tips: [String] = []
    ) {
        self.dailyTargets = dailyTargets
        self.trainingTargets = trainingTargets
        self.restTargets = restTargets
        self.weekdayTargetList = weekdayTargetList
        self.weeklyPlan = weeklyPlan
        self.tips = tips
    }

    private enum CodingKeys: String, CodingKey {
        case dailyTargets
        case trainingTargets
        case restTargets
        case weeklyPlan
        case tips
        case weekdayTargetList
        /// Prior build persisted a string-keyed map; migrate into `weekdayTargetList` on decode.
        case weekdayTargets
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dailyTargets = try c.decode(Macros.self, forKey: .dailyTargets)
        trainingTargets = try c.decodeIfPresent(Macros.self, forKey: .trainingTargets)
        restTargets = try c.decodeIfPresent(Macros.self, forKey: .restTargets)
        weeklyPlan = try c.decodeIfPresent([DietDay].self, forKey: .weeklyPlan) ?? []
        tips = try c.decodeIfPresent([String].self, forKey: .tips) ?? []
        if let list = try c.decodeIfPresent([Macros].self, forKey: .weekdayTargetList) {
            weekdayTargetList = list
        } else if let map = try c.decodeIfPresent([String: Macros].self, forKey: .weekdayTargets) {
            weekdayTargetList = WeekdayMacros.weekdayList(from: map)
        } else {
            weekdayTargetList = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(dailyTargets, forKey: .dailyTargets)
        try c.encodeIfPresent(trainingTargets, forKey: .trainingTargets)
        try c.encodeIfPresent(restTargets, forKey: .restTargets)
        try c.encode(weeklyPlan, forKey: .weeklyPlan)
        try c.encode(tips, forKey: .tips)
        try c.encodeIfPresent(weekdayTargetList, forKey: .weekdayTargetList)
    }
}

public struct WorkoutPlan: Codable, Sendable {
    public var weeklyPlan: [WorkoutDay]
    public var tips: [String]
    /// `yyyy-MM-dd` anchor for multi-week PDF plans (program week 1); matches web `programWeek1Start`.
    public var programWeek1Start: String?
    public var advancementMode: AdvancementMode?
    public var programWeekOffset: Int?
    public var pausedUntil: String?
    public var missedSessions: [MissedSession]?
    public var catchUpBannerDismissedAt: String?

    public init(
        weeklyPlan: [WorkoutDay],
        tips: [String],
        programWeek1Start: String? = nil,
        advancementMode: AdvancementMode? = nil,
        programWeekOffset: Int? = nil,
        pausedUntil: String? = nil,
        missedSessions: [MissedSession]? = nil,
        catchUpBannerDismissedAt: String? = nil
    ) {
        self.weeklyPlan = weeklyPlan
        self.tips = tips
        self.programWeek1Start = programWeek1Start
        self.advancementMode = advancementMode
        self.programWeekOffset = programWeekOffset
        self.pausedUntil = pausedUntil
        self.missedSessions = missedSessions
        self.catchUpBannerDismissedAt = catchUpBannerDismissedAt
    }
}

public enum AdvancementMode: String, Codable, Sendable {
    case calendar
    case completion
}

public enum MissedSessionStatus: String, Codable, Sendable {
    case missed
    case skipped
    case rescheduled
}

public enum ScheduleAction: String, Codable, Sendable {
    case stayOnWeek = "stay_on_week"
    case skipWeek = "skip_week"
    case catchUp = "catch_up"
    case repeatWeek = "repeat_week"
    case skipToday = "skip_today"
    case reschedule
}

public struct MissedSession: Codable, Sendable, Identifiable {
    public var id: String
    public var planIndex: Int
    public var scheduledDate: String
    public var status: MissedSessionStatus
    public var rescheduledTo: String?
    public var dayLabel: String?
    public var focus: String?

    public init(
        id: String,
        planIndex: Int,
        scheduledDate: String,
        status: MissedSessionStatus,
        rescheduledTo: String? = nil,
        dayLabel: String? = nil,
        focus: String? = nil
    ) {
        self.id = id
        self.planIndex = planIndex
        self.scheduledDate = scheduledDate
        self.status = status
        self.rescheduledTo = rescheduledTo
        self.dayLabel = dayLabel
        self.focus = focus
    }
}
