import Foundation

/// Diet phase state machine.
///
/// The app already estimates TDEE well (`/api/metabolic/update` regresses weight trend against
/// intake). Nothing consumed it. This closes that loop: it reads the trend, judges whether the
/// rate of change is actually productive, and moves the lifter between phases — cut,
/// maintenance, diet break, lean bulk — instead of letting them sit in a permanent deficit
/// until adherence collapses.
///
/// The core judgement is rate, not direction. Losing 3 lb a week is not "working better" than
/// losing 1; it is losing lean mass and borrowing against the next twelve weeks.
///
/// Port of web `src/lib/diet-phase.ts`. Mirrored on Android in `api/DietPhase.kt`.
public enum DietPhase {

    // MARK: - Tunables

    /// Smoothing factor for the exponentially weighted trend weight (~10-day half life).
    private static let trendAlpha = 0.1
    /// Minimum weigh-ins before a trend is trustworthy.
    private static let minWeighIns = 4

    /// Productive weekly loss, as a fraction of body weight.
    private static let lossTargetMin = 0.005
    private static let lossTargetMax = 0.01
    /// Past this, lean mass is going with the fat.
    private static let lossAggressive = 0.015

    /// Productive weekly gain on a lean bulk, as a fraction of body weight.
    private static let gainTargetMin = 0.0025
    private static let gainTargetMax = 0.005

    /// Consecutive weeks in a deficit before a diet break is due.
    private static let dietBreakAfterWeeks = 12
    /// A stall this long in an active phase means the plan needs changing.
    private static let stallWeeks = 3

    /// kcal per pound of body mass.
    private static let kcalPerLb = 3500.0

    // MARK: - Types

    public enum Name: String, Sendable {
        case cut, maintenance, dietBreak, leanBulk, recomp

        public var label: String {
            switch self {
            case .cut: return "Cut"
            case .maintenance: return "Maintenance"
            case .dietBreak: return "Diet break"
            case .leanBulk: return "Lean bulk"
            case .recomp: return "Recomp"
            }
        }
    }

    public enum RateVerdict: String, Sendable {
        case tooFast, onTrack, tooSlow, stalled, wrongDirection
    }

    public struct WeighIn: Sendable {
        public let date: String
        public let weightLbs: Double?
        public let bodyFatPercent: Double?

        public init(date: String, weightLbs: Double?, bodyFatPercent: Double? = nil) {
            self.date = date
            self.weightLbs = weightLbs
            self.bodyFatPercent = bodyFatPercent
        }
    }

    public struct Trend: Sendable {
        /// Exponentially weighted trend weight in lbs — the number to coach off.
        public let trendWeightLbs: Double
        public let latestWeightLbs: Double
        /// Weekly change in lbs (negative = losing).
        public let weeklyChangeLbs: Double
        /// Weekly change as a fraction of body weight.
        public let weeklyChangePct: Double
        public let weighInCount: Int
        public let spanDays: Int
        /// False when there is not enough data to judge anything.
        public let reliable: Bool
    }

    public struct LeanMassSignal: Sendable {
        public let leanChangeLbs: Double
        public let leanShareOfLoss: Double
        public let losingLeanMass: Bool
    }

    public struct Assessment: Sendable {
        public let phase: Name
        public let rateVerdict: RateVerdict
        public let trend: Trend
        public let leanMass: LeanMassSignal?
        /// Suggested daily calorie change from current intake. 0 when nothing should move.
        public let calorieAdjustment: Int
        public let weeksInPhase: Int
        public let dietBreakDue: Bool
        public let headline: String
        public let details: [String]
        public let suggestedPhase: Name?
    }

    // MARK: - Trend weight

    private static func dayNumber(_ date: String, formatter: DateFormatter) -> Double? {
        formatter.date(from: date).map { $0.timeIntervalSince1970 / 86_400 }
    }

    /// Exponentially weighted trend weight and its weekly rate of change.
    ///
    /// Daily scale weight swings several pounds on water and glycogen alone. Coaching off the
    /// last weigh-in produces whiplash; coaching off the trend produces decisions.
    public static func computeTrend(weighIns: [WeighIn]) -> Trend {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current

        let points = weighIns
            .compactMap { w -> (date: String, weight: Double)? in
                guard let weight = w.weightLbs, weight > 0 else { return nil }
                return (w.date, weight)
            }
            .sorted { $0.date < $1.date }

        guard let first = points.first, let last = points.last else {
            return Trend(
                trendWeightLbs: 0, latestWeightLbs: 0, weeklyChangeLbs: 0, weeklyChangePct: 0,
                weighInCount: 0, spanDays: 0, reliable: false
            )
        }

        // EWMA gives the displayed trend weight — smooth, and what the user reads off the scale.
        var trend = first.weight
        for point in points.dropFirst() {
            trend = trendAlpha * point.weight + (1 - trendAlpha) * trend
        }

        guard let day0 = dayNumber(first.date, formatter: formatter),
              let dayN = dayNumber(last.date, formatter: formatter) else {
            return Trend(
                trendWeightLbs: (trend * 10).rounded() / 10, latestWeightLbs: last.weight,
                weeklyChangeLbs: 0, weeklyChangePct: 0,
                weighInCount: points.count, spanDays: 0, reliable: false
            )
        }
        let spanDays = Swift.max(0, Int((dayN - day0).rounded()))

        /*
         * Rate comes from least-squares regression on the raw weigh-ins, not from the EWMA.
         * An EWMA lags a trending series, so measuring endpoint-to-endpoint across it would
         * systematically understate how fast weight is actually moving — which would have the
         * engine calling an aggressive 2%/week cut "on track". Regression is unbiased.
         */
        var weeklyChangeLbs = 0.0
        if spanDays >= 7, points.count >= 2 {
            let xs = points.compactMap { dayNumber($0.date, formatter: formatter).map { $0 - day0 } }
            let ys = points.map(\.weight)
            if xs.count == ys.count, xs.count >= 2 {
                let n = Double(xs.count)
                let meanX = xs.reduce(0, +) / n
                let meanY = ys.reduce(0, +) / n
                var ssXY = 0.0
                var ssXX = 0.0
                for i in xs.indices {
                    ssXY += (xs[i] - meanX) * (ys[i] - meanY)
                    ssXX += (xs[i] - meanX) * (xs[i] - meanX)
                }
                weeklyChangeLbs = ssXX == 0 ? 0 : (ssXY / ssXX) * 7
            }
        }

        let weeklyChangePct = trend > 0 ? weeklyChangeLbs / trend : 0

        return Trend(
            trendWeightLbs: (trend * 10).rounded() / 10,
            latestWeightLbs: last.weight,
            weeklyChangeLbs: (weeklyChangeLbs * 100).rounded() / 100,
            weeklyChangePct: (weeklyChangePct * 10000).rounded() / 10000,
            weighInCount: points.count,
            spanDays: spanDays,
            reliable: points.count >= minWeighIns && spanDays >= 10
        )
    }

    /// Whether weight lost is coming from fat or from muscle.
    ///
    /// A cut that strips lean mass is not a successful cut — it is the reason people end a diet
    /// smaller, weaker, and with a lower TDEE than they started.
    public static func computeLeanMassSignal(weighIns: [WeighIn]) -> LeanMassSignal? {
        let points = weighIns
            .compactMap { w -> (date: String, weight: Double, bf: Double)? in
                guard let weight = w.weightLbs, weight > 0,
                      let bf = w.bodyFatPercent, bf > 0 else { return nil }
                return (w.date, weight, bf)
            }
            .sorted { $0.date < $1.date }

        guard points.count >= 2, let first = points.first, let last = points.last else { return nil }

        let leanFirst = first.weight * (1 - first.bf / 100)
        let leanLast = last.weight * (1 - last.bf / 100)
        let leanChangeLbs = ((leanLast - leanFirst) * 100).rounded() / 100
        let totalChange = last.weight - first.weight

        // Only meaningful while losing; a gain phase is judged on other terms.
        let leanShareOfLoss = totalChange < 0
            ? ((abs(leanChangeLbs) / abs(totalChange)) * 100).rounded() / 100
            : 0

        return LeanMassSignal(
            leanChangeLbs: leanChangeLbs,
            leanShareOfLoss: leanShareOfLoss,
            // More than a quarter of loss coming from lean tissue is the warning line.
            losingLeanMass: totalChange < 0 && leanChangeLbs < 0 && leanShareOfLoss > 0.25
        )
    }

    // MARK: - Rate judgement

    private static func verdictForCut(_ pct: Double) -> RateVerdict {
        let loss = -pct
        if loss >= lossAggressive { return .tooFast }
        if loss >= lossTargetMin { return .onTrack }
        if loss > 0 { return .tooSlow }
        if pct == 0 { return .stalled }
        return .wrongDirection
    }

    private static func verdictForBulk(_ pct: Double) -> RateVerdict {
        if pct > gainTargetMax { return .tooFast }
        if pct >= gainTargetMin { return .onTrack }
        if pct > 0 { return .tooSlow }
        if pct == 0 { return .stalled }
        return .wrongDirection
    }

    /// Maintenance wants the trend flat; drift in either direction is the signal.
    private static func verdictForFlat(_ pct: Double) -> RateVerdict {
        if abs(pct) <= 0.0025 { return .onTrack }
        return pct > 0 ? .tooFast : .wrongDirection
    }

    public static func phase(for goal: FitnessGoal) -> Name {
        switch goal {
        case .loseWeight: return .cut
        case .buildMuscle: return .leanBulk
        case .maintain, .improveEndurance: return .maintenance
        }
    }

    // MARK: - Assessment

    /// Read the trend and decide what should change.
    ///
    /// Deliberately conservative: with thin data it says so and adjusts nothing, because a
    /// calorie change made on noise costs more trust than a week of waiting.
    public static func assess(
        goal: FitnessGoal,
        weighIns: [WeighIn],
        currentCalories: Int,
        estimatedTDEE: Int? = nil,
        tdeeConfidence: Int? = nil,
        weeksInDeficit: Int? = nil
    ) -> Assessment {
        let trend = computeTrend(weighIns: weighIns)
        let leanMass = computeLeanMassSignal(weighIns: weighIns)
        let currentPhase = phase(for: goal)
        let weeksInPhase = trend.spanDays / 7
        let deficitWeeks = weeksInDeficit ?? (currentPhase == .cut ? weeksInPhase : 0)
        let dietBreakDue = currentPhase == .cut && deficitWeeks >= dietBreakAfterWeeks

        guard trend.reliable else {
            return Assessment(
                phase: currentPhase, rateVerdict: .stalled, trend: trend, leanMass: leanMass,
                calorieAdjustment: 0, weeksInPhase: weeksInPhase, dietBreakDue: false,
                headline: "Not enough weigh-ins yet to judge your rate.",
                details: ["Log at least \(minWeighIns) weigh-ins across 10+ days and this turns into real guidance."],
                suggestedPhase: nil
            )
        }

        let pct = trend.weeklyChangePct
        let rateVerdict = currentPhase == .cut
            ? verdictForCut(pct)
            : (currentPhase == .leanBulk ? verdictForBulk(pct) : verdictForFlat(pct))

        var details: [String] = []
        var calorieAdjustment = 0
        var headline = ""
        var suggestedPhase: Name?

        let weeklyAbs = abs(trend.weeklyChangeLbs)
        let weeklyStr = String(format: "%.1f", weeklyAbs)
        let pctLabel = String(format: "%.2f%%", abs(pct) * 100)

        if dietBreakDue {
            suggestedPhase = .dietBreak
            calorieAdjustment = Swift.max(0, (estimatedTDEE ?? currentCalories) - currentCalories)
            headline = "\(deficitWeeks) weeks in a deficit — time for a diet break."
            details.append("Eat at maintenance for 1–2 weeks. This restores hormones and adherence, and makes the next block of fat loss work.")
            if calorieAdjustment > 0 {
                details.append("That means about +\(calorieAdjustment) kcal/day back to maintenance.")
            }
        } else if currentPhase == .cut {
            switch rateVerdict {
            case .tooFast:
                calorieAdjustment = Int((((weeklyAbs - trend.trendWeightLbs * lossTargetMax) * kcalPerLb) / 7).rounded())
                headline = "Losing \(weeklyStr) lb/week (\(pctLabel)) — faster than is productive."
                details.append("Above ~1% of body weight per week, a growing share of the loss is muscle.")
                details.append("Add about \(calorieAdjustment) kcal/day to bring this into the productive range.")
            case .onTrack:
                headline = "Losing \(weeklyStr) lb/week (\(pctLabel)) — right in the productive range."
                details.append("Hold everything. This is the rate that keeps muscle while fat comes off.")
            case .tooSlow:
                calorieAdjustment = -Int((((trend.trendWeightLbs * lossTargetMin - weeklyAbs) * kcalPerLb) / 7).rounded())
                headline = "Losing \(weeklyStr) lb/week — slower than target."
                details.append("Trim about \(abs(calorieAdjustment)) kcal/day, or add steps before cutting food.")
            case .stalled, .wrongDirection:
                calorieAdjustment = -200
                headline = rateVerdict == .stalled
                    ? "Weight trend is flat — the deficit has closed."
                    : "Trend is up \(weeklyStr) lb/week while cutting."
                details.append("Either intake has drifted up or your TDEE has adapted. Tighten logging for a week before cutting further.")
                if weeksInPhase >= stallWeeks {
                    details.append("It has been \(weeksInPhase) weeks — worth a diet break before pushing harder.")
                    suggestedPhase = .dietBreak
                }
            }
        } else if currentPhase == .leanBulk {
            switch rateVerdict {
            case .tooFast:
                calorieAdjustment = -Int((((trend.weeklyChangeLbs - trend.trendWeightLbs * gainTargetMax) * kcalPerLb) / 7).rounded())
                headline = "Gaining \(weeklyStr) lb/week (\(pctLabel)) — faster than you can build."
                details.append("Past ~0.5% per week the surplus mostly becomes fat. Pull back to keep the bulk lean.")
            case .onTrack:
                headline = "Gaining \(weeklyStr) lb/week — a lean-bulk pace."
                details.append("Hold here and keep the progressive overload coming.")
            case .tooSlow, .stalled:
                calorieAdjustment = 200
                headline = rateVerdict == .stalled
                    ? "Weight trend is flat — you are eating at maintenance, not a surplus."
                    : "Gaining \(weeklyStr) lb/week — under the target pace."
                details.append("Add about 200 kcal/day and re-check in two weeks.")
            case .wrongDirection:
                calorieAdjustment = 300
                headline = "Losing \(weeklyStr) lb/week while trying to build."
                details.append("You are in a deficit. Add roughly 300 kcal/day.")
            }
        } else {
            switch rateVerdict {
            case .onTrack:
                headline = "Weight is holding steady — maintenance is working."
                details.append("With training progressing, this is where a recomp happens.")
            case .tooFast:
                calorieAdjustment = -150
                headline = "Trending up \(weeklyStr) lb/week during maintenance."
                details.append("Trim about 150 kcal/day to flatten it out.")
            default:
                calorieAdjustment = 150
                headline = "Trending down \(weeklyStr) lb/week during maintenance."
                details.append("Add about 150 kcal/day to hold your weight.")
            }
        }

        // Lean-mass loss overrides an otherwise acceptable rate.
        if let leanMass, leanMass.losingLeanMass, currentPhase == .cut {
            let share = Int((leanMass.leanShareOfLoss * 100).rounded())
            details.insert("\(share)% of what you have lost is lean mass. Slow the deficit and keep protein and hard sets high.", at: 0)
            if calorieAdjustment <= 0 {
                calorieAdjustment = Int(((trend.trendWeightLbs * lossTargetMin * kcalPerLb) / 7 / 2).rounded())
            }
        }

        // A drifting TDEE estimate is worth surfacing once it is trustworthy.
        if let tdee = estimatedTDEE, (tdeeConfidence ?? 0) >= 50, abs(tdee - currentCalories) >= 200 {
            details.append("Your measured TDEE is about \(tdee) kcal against a \(currentCalories) kcal target.")
        }

        return Assessment(
            phase: currentPhase, rateVerdict: rateVerdict, trend: trend, leanMass: leanMass,
            calorieAdjustment: calorieAdjustment, weeksInPhase: weeksInPhase,
            dietBreakDue: dietBreakDue, headline: headline, details: details,
            suggestedPhase: suggestedPhase
        )
    }
}
