import Foundation

/// Badges earned by the body changing rather than the app being used.
///
/// Every detector here reads from the deterministic engines (`Progression`, `MuscleVolume`,
/// `DietPhase`) rather than re-deriving anything, so a badge can never celebrate a number
/// the coach would not also report.
///
/// Port of the outcome section of web `src/lib/milestones.ts`.
/// Mirrored on Android in `api/OutcomeMilestones.kt`.
public enum OutcomeMilestones {

    public struct Input: Sendable {
        /// Per-set performance history — drives every strength and volume outcome badge.
        public var setLogs: [WorkoutSetLogDTO]
        /// Weigh-ins with optional body fat — drives every body-composition badge.
        public var weighIns: [DietPhase.WeighIn]
        /// True once a scheduled or fatigue-driven deload week has been trained through.
        public var completedDeload: Bool
        /// User's training level, for scaling volume landmarks.
        public var fitnessLevel: String?
        /// Badges already earned; never re-awarded.
        public var earned: Set<MilestoneType>
        public var today: String

        public init(
            setLogs: [WorkoutSetLogDTO] = [],
            weighIns: [DietPhase.WeighIn] = [],
            completedDeload: Bool = false,
            fitnessLevel: String? = nil,
            earned: Set<MilestoneType> = [],
            today: String = DateHelpers.todayString()
        ) {
            self.setLogs = setLogs
            self.weighIns = weighIns
            self.completedDeload = completedDeload
            self.fitnessLevel = fitnessLevel
            self.earned = earned
            self.today = today
        }
    }

    public struct Result: Sendable {
        public let newlyEarned: [MilestoneType]
        /// 0-100 progress toward badges not yet earned, keyed by raw value.
        public let progress: [String: Double]
    }

    public static func evaluate(_ input: Input) -> Result {
        var newlyEarned: [MilestoneType] = []
        var progress: [String: Double] = [:]

        func award(_ type: MilestoneType) {
            guard !input.earned.contains(type), !newlyEarned.contains(type) else { return }
            newlyEarned.append(type)
        }

        // MARK: Strength

        if !input.setLogs.isEmpty {
            let progressions = Progression.buildAllProgressions(logs: input.setLogs)

            // A first PR requires a second session to beat the first — otherwise every new
            // exercise would instantly "PR" on the day it is introduced.
            if progressions.contains(where: { $0.sessions.count >= 2 && $0.bestE1rmDate != $0.sessions.first?.date }) {
                award(.firstPR)
            }

            let bestGain = progressions.reduce(0.0) { Swift.max($0, $1.changePct) }
            progress[MilestoneType.strengthUp5.rawValue] = Swift.min(100, (bestGain / 5) * 100)
            if bestGain >= 5 { award(.strengthUp5) }
            if bestGain >= 10 { award(.strengthUp10) }
            if bestGain >= 25 { award(.strengthUp25) }

            // Eight distinct training weeks with logged sets.
            let weeks = Set(
                input.setLogs
                    .filter { $0.reps != nil }
                    .map { DateHelpers.mondayWeekStartString(containingCalendarDay: $0.date) }
            )
            progress[MilestoneType.consistentLifter.rawValue] = Swift.min(100, (Double(weeks.count) / 8) * 100)
            if weeks.count >= 8 { award(.consistentLifter) }

            // Every muscle that was trained at all cleared its weekly minimum. Untouched
            // groups are excluded — a well-run split should not be penalized for rest days.
            let volume = MuscleVolume.computeWeekly(
                setLogs: input.setLogs,
                weekStart: DateHelpers.mondayWeekStartString(containingCalendarDay: input.today),
                fitnessLevel: input.fitnessLevel
            )
            let trained = volume.entries.filter { $0.sets > 0 }
            if trained.count >= 4, trained.allSatisfy({ $0.status != .under }) {
                award(.volumeBalanced)
            }
        }

        if input.completedDeload { award(.deloadCompleted) }

        // MARK: Body composition

        let sorted = input.weighIns
            .filter { ($0.weightLbs ?? 0) > 0 }
            .sorted { $0.date < $1.date }

        if sorted.count >= 2 {
            /*
             * Compare the mean of the first three weigh-ins against the mean of the last three.
             *
             * The EWMA trend used elsewhere is deliberately laggy — good for "what do I weigh
             * today", wrong for "how much have I lost in total", where it under-credits by
             * ~8 lb on a 20 lb loss. A short mean at each end is lag-free and still immune to
             * a single anomalous reading, which is exactly what a cumulative badge needs.
             */
            let windowSize = Swift.max(1, Swift.min(3, sorted.count / 2))
            let meanOf: ([DietPhase.WeighIn]) -> Double = { window in
                window.reduce(0.0) { $0 + ($1.weightLbs ?? 0) } / Double(window.count)
            }
            let baseline = meanOf(Array(sorted.prefix(windowSize)))
            let current = meanOf(Array(sorted.suffix(windowSize)))
            let lost = baseline - current

            // Same reliability bar the diet engine uses (4+ weigh-ins across 10+ days).
            if DietPhase.computeTrend(weighIns: sorted).reliable {
                progress[MilestoneType.trendDown5.rawValue] = Swift.min(100, (lost / 5) * 100)
                if lost >= 5 { award(.trendDown5) }
                if lost >= 15 { award(.trendDown15) }
                if lost >= 30 { award(.trendDown30) }
            }

            let withBodyFat = sorted.filter { ($0.bodyFatPercent ?? 0) > 0 }
            if withBodyFat.count >= 2,
               let first = withBodyFat.first, let last = withBodyFat.last,
               let firstWeight = first.weightLbs, let lastWeight = last.weightLbs,
               let firstBF = first.bodyFatPercent, let lastBF = last.bodyFatPercent {

                let bodyFatDrop = firstBF - lastBF
                progress[MilestoneType.bodyfatDown2.rawValue] = Swift.min(100, (bodyFatDrop / 2) * 100)
                if bodyFatDrop >= 2 { award(.bodyfatDown2) }
                if bodyFatDrop >= 5 { award(.bodyfatDown5) }

                let leanFirst = firstWeight * (1 - firstBF / 100)
                let leanLast = lastWeight * (1 - lastBF / 100)
                let leanGain = leanLast - leanFirst
                let fatFirst = firstWeight - leanFirst
                let fatLast = lastWeight - leanLast

                progress[MilestoneType.leanMassGained.rawValue] = Swift.min(100, (leanGain / 3) * 100)
                if leanGain >= 3 { award(.leanMassGained) }

                // The hardest outcome in the app: fat down and lean up over the same window.
                if leanGain >= 1, fatLast < fatFirst - 1 { award(.recompAchieved) }
            }
        }

        return Result(newlyEarned: newlyEarned, progress: progress)
    }

    /// Whether the lifter has actually trained through a deload week.
    ///
    /// A deload only counts once it is behind them and they logged work during it — skipping
    /// the week entirely is not the same as executing a planned back-off.
    public static func hasCompletedDeloadWeek(
        anchorWeekStart: String,
        programWeekNow: Int,
        loggedWeekStarts: Set<String>,
        blockLength: Int = Mesocycle.defaultBlockLength
    ) -> Bool {
        let length = Mesocycle.clampBlockLength(blockLength)
        guard let anchor = DateHelpers.date(from: anchorWeekStart) else { return false }

        // Deload weeks sit at every multiple of the block length.
        var week = length
        while week < programWeekNow {
            if let weekStart = Calendar.current.date(byAdding: .day, value: (week - 1) * 7, to: anchor),
               loggedWeekStarts.contains(DateHelpers.dateString(from: weekStart)) {
                return true
            }
            week += length
        }
        return false
    }
}
