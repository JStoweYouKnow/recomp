import Foundation

/// Mesocycle periodization and fatigue-driven deloads.
///
/// A 12-week program that repeats week 1 twelve times is where transformations stall around
/// week five: volume never ramps, fatigue never gets cleared, and the lifter grinds until
/// something hurts. This gives the program a shape — volume climbing across a block, a peak
/// week, then a deload — and watches real fatigue signals so the deload can arrive early
/// when the body asks for it.
///
/// Port of web `src/lib/mesocycle.ts`. Mirrored on Android in `api/Mesocycle.kt`.
public enum Mesocycle {

    // MARK: - Tunables

    /// Weeks per block, including the trailing deload.
    public static let defaultBlockLength = 5
    public static let minBlockLength = 3
    public static let maxBlockLength = 8

    /// Volume ramp across accumulation weeks.
    private static let rampStart = 0.85
    private static let rampEnd = 1.15
    /// Peak week: volume backs off slightly so intensity can rise.
    private static let peakVolume = 1.0
    private static let peakIntensity = 1.03
    /// Deload: half the work at 90% of the load.
    private static let deloadVolume = 0.5
    private static let deloadIntensity = 0.9

    /// Fatigue score at or above this means deload now.
    private static let deloadNowScore = 50
    /// Below `now` but at or above this means deload is coming.
    private static let deloadSoonScore = 30

    // MARK: - Types

    public enum Phase: String, Sendable {
        case accumulation, peak, deload

        public var label: String {
            switch self {
            case .accumulation: return "Accumulation"
            case .peak: return "Peak"
            case .deload: return "Deload"
            }
        }
    }

    public struct State: Sendable {
        /// 1-based week within the current block.
        public let weekInBlock: Int
        public let blockLength: Int
        /// 1-based block number since the program started.
        public let blockNumber: Int
        public let phase: Phase
        /// Multiplier on prescribed sets this week.
        public let volumeMultiplier: Double
        /// Multiplier on prescribed load this week. Feeds `Progression.Options.intensityMultiplier`.
        public let intensityMultiplier: Double
        /// One-line explanation for the UI and the coach.
        public let summary: String
    }

    public struct FatigueSignals: Sendable {
        /// Lifts with no e1RM progress for 3+ sessions.
        public var stalledLifts: Int
        /// Change in average top-set RPE, recent window vs the one before it.
        public var rpeCreep: Double
        /// Muscle groups logged past their maximum recoverable volume.
        public var musclesOverMrv: Int
        /// 0-100 recovery score, when a wearable supplies one.
        public var readinessScore: Double?
        /// Sessions missed in the last 7 days.
        public var missedSessions: Int

        public init(
            stalledLifts: Int = 0,
            rpeCreep: Double = 0,
            musclesOverMrv: Int = 0,
            readinessScore: Double? = nil,
            missedSessions: Int = 0
        ) {
            self.stalledLifts = stalledLifts
            self.rpeCreep = rpeCreep
            self.musclesOverMrv = musclesOverMrv
            self.readinessScore = readinessScore
            self.missedSessions = missedSessions
        }
    }

    public enum DeloadUrgency: String, Sendable { case none, soon, now }

    public struct DeloadRecommendation: Sendable {
        public let shouldDeload: Bool
        public let urgency: DeloadUrgency
        /// Weighted fatigue score, 0-100.
        public let score: Int
        /// Plain-language reasons, most significant first.
        public let reasons: [String]
    }

    // MARK: - Block position

    public static func clampBlockLength(_ weeks: Int?) -> Int {
        guard let weeks else { return defaultBlockLength }
        return Swift.min(maxBlockLength, Swift.max(minBlockLength, weeks))
    }

    /// Where a given program week sits inside its block. `programWeek` is 1-based and
    /// continuous across the whole program.
    public static func blockPosition(
        programWeek: Int,
        blockLength: Int = defaultBlockLength
    ) -> (weekInBlock: Int, blockNumber: Int) {
        let length = clampBlockLength(blockLength)
        let week = Swift.max(1, programWeek)
        let zeroBased = week - 1
        return (zeroBased % length + 1, zeroBased / length + 1)
    }

    /// The training shape for a week: accumulation weeks ramp volume, the second-to-last week
    /// peaks intensity, and the final week deloads to clear accumulated fatigue.
    public static func state(
        programWeek: Int,
        blockLength: Int = defaultBlockLength
    ) -> State {
        let length = clampBlockLength(blockLength)
        let position = blockPosition(programWeek: programWeek, blockLength: length)

        if position.weekInBlock == length {
            return State(
                weekInBlock: position.weekInBlock,
                blockLength: length,
                blockNumber: position.blockNumber,
                phase: .deload,
                volumeMultiplier: deloadVolume,
                intensityMultiplier: deloadIntensity,
                summary: "Deload week — half the sets at 90% load. This is where the last \(length - 1) weeks turn into adaptation."
            )
        }

        // Peak week only exists in blocks long enough to have built something worth peaking.
        if length >= 4, position.weekInBlock == length - 1 {
            return State(
                weekInBlock: position.weekInBlock,
                blockLength: length,
                blockNumber: position.blockNumber,
                phase: .peak,
                volumeMultiplier: peakVolume,
                intensityMultiplier: peakIntensity,
                summary: "Peak week — volume eases back so you can push the heaviest loads of the block."
            )
        }

        // Ramp across the accumulation weeks that precede the peak.
        let accumulationWeeks = Swift.max(1, length - (length >= 4 ? 2 : 1))
        let step = accumulationWeeks > 1 ? (rampEnd - rampStart) / Double(accumulationWeeks - 1) : 0
        let raw = rampStart + step * Double(position.weekInBlock - 1)
        let volumeMultiplier = (raw * 100).rounded() / 100

        return State(
            weekInBlock: position.weekInBlock,
            blockLength: length,
            blockNumber: position.blockNumber,
            phase: .accumulation,
            volumeMultiplier: volumeMultiplier,
            intensityMultiplier: 1,
            summary: "Accumulation week \(position.weekInBlock) of \(length) — volume climbing toward the peak."
        )
    }

    // MARK: - Fatigue detection

    /// Change in average top-set RPE between the two most recent windows.
    ///
    /// Rising RPE at the same loads is the earliest honest signal that fatigue is outpacing
    /// recovery — it shows up before the bar speed drops and well before a lift stalls outright.
    public static func rpeCreep(
        setLogs: [WorkoutSetLogDTO],
        windowDays: Int = 7,
        today: String = DateHelpers.todayString()
    ) -> Double {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current

        guard let end = formatter.date(from: today),
              let midpoint = Calendar.current.date(byAdding: .day, value: -windowDays, to: end),
              let start = Calendar.current.date(byAdding: .day, value: -windowDays * 2, to: end)
        else { return 0 }

        var recent: [Double] = []
        var prior: [Double] = []

        for log in setLogs {
            guard log.section != "warmup", let rpe = log.rpe else { continue }
            guard let date = formatter.date(from: log.date), date <= end else { continue }
            if date > midpoint { recent.append(rpe) }
            else if date > start { prior.append(rpe) }
        }

        guard !recent.isEmpty, !prior.isEmpty else { return 0 }
        let mean: ([Double]) -> Double = { $0.reduce(0, +) / Double($0.count) }
        return ((mean(recent) - mean(prior)) * 100).rounded() / 100
    }

    /// Gather the signals a deload decision rests on.
    public static func buildFatigueSignals(
        progressions: [Progression.ExerciseProgression],
        setLogs: [WorkoutSetLogDTO],
        musclesOverMrv: Int = 0,
        readinessScore: Double? = nil,
        missedSessions: Int = 0,
        today: String = DateHelpers.todayString()
    ) -> FatigueSignals {
        FatigueSignals(
            stalledLifts: progressions.filter(\.stalled).count,
            rpeCreep: rpeCreep(setLogs: setLogs, windowDays: 7, today: today),
            musclesOverMrv: musclesOverMrv,
            readinessScore: readinessScore,
            missedSessions: missedSessions
        )
    }

    /// Score accumulated fatigue and decide whether the block should end early.
    ///
    /// No single signal is trusted on its own — one stalled lift is noise, but a stalled lift
    /// plus rising RPE plus a group past MRV is a block that has run its course.
    public static func assessDeloadNeed(
        _ signals: FatigueSignals,
        currentPhase: Phase? = nil
    ) -> DeloadRecommendation {
        // Already deloading — nothing to recommend.
        if currentPhase == .deload {
            return DeloadRecommendation(
                shouldDeload: false, urgency: .none, score: 0,
                reasons: ["Already in a deload week."]
            )
        }

        var score = 0
        var reasons: [String] = []

        if signals.stalledLifts >= 2 {
            score += 30
            reasons.append("\(signals.stalledLifts) lifts have stopped progressing.")
        } else if signals.stalledLifts == 1 {
            score += 12
            reasons.append("One lift has stopped progressing.")
        }

        if signals.rpeCreep >= 0.5 {
            score += 25
            reasons.append("Same loads are feeling \(String(format: "%.1f", signals.rpeCreep)) RPE harder than last week.")
        } else if signals.rpeCreep >= 0.25 {
            score += 12
            reasons.append("Sessions are starting to feel harder at the same loads.")
        }

        if signals.musclesOverMrv >= 2 {
            score += 25
            reasons.append("\(signals.musclesOverMrv) muscle groups are past their recoverable volume.")
        } else if signals.musclesOverMrv == 1 {
            score += 15
            reasons.append("One muscle group is past its recoverable volume.")
        }

        if let readiness = signals.readinessScore, readiness < 50 {
            score += 20
            reasons.append("Recovery is running low (\(Int(readiness.rounded()))/100).")
        } else if let readiness = signals.readinessScore, readiness < 65 {
            score += 10
            reasons.append("Recovery has been below par.")
        }

        if signals.missedSessions >= 2 {
            score += 10
            reasons.append("\(signals.missedSessions) sessions missed this week.")
        }

        score = Swift.min(100, score)
        let urgency: DeloadUrgency = score >= deloadNowScore ? .now : (score >= deloadSoonScore ? .soon : .none)

        return DeloadRecommendation(
            shouldDeload: urgency == .now,
            urgency: urgency,
            score: score,
            reasons: reasons
        )
    }

    public struct Resolution: Sendable {
        public let state: State
        public let deload: DeloadRecommendation
        public let deloadForced: Bool
    }

    /// The week's plan, with an early deload substituted when fatigue demands one.
    /// This is the single call the UI and coach should use.
    public static func resolve(
        programWeek: Int,
        blockLength: Int = defaultBlockLength,
        signals: FatigueSignals? = nil
    ) -> Resolution {
        let scheduled = state(programWeek: programWeek, blockLength: blockLength)
        let deload = signals.map { assessDeloadNeed($0, currentPhase: scheduled.phase) }
            ?? DeloadRecommendation(shouldDeload: false, urgency: .none, score: 0, reasons: [])

        guard deload.shouldDeload else {
            return Resolution(state: scheduled, deload: deload, deloadForced: false)
        }

        let reason = deload.reasons.first ?? ""
        return Resolution(
            state: State(
                weekInBlock: scheduled.weekInBlock,
                blockLength: scheduled.blockLength,
                blockNumber: scheduled.blockNumber,
                phase: .deload,
                volumeMultiplier: deloadVolume,
                intensityMultiplier: deloadIntensity,
                summary: "Early deload — fatigue signals say this block is done. \(reason)"
                    .trimmingCharacters(in: .whitespaces)
            ),
            deload: deload,
            deloadForced: true
        )
    }
}
