import SwiftUI
import SwiftData
import RefactorKit

/// Dashboard wrapper that reads weigh-ins, plan targets, and the metabolic model from
/// SwiftData, then hands a finished assessment to `DietPhaseCard`.
struct DietPhaseDashboardCard: View {
    @Query(sort: \WearableDaySummary.date, order: .reverse) private var wearables: [WearableDaySummary]
    @Query(sort: \MetabolicModel.lastUpdated, order: .reverse) private var metabolicModels: [MetabolicModel]
    @Query(sort: \FitnessPlan.createdAt, order: .reverse) private var plans: [FitnessPlan]
    @Query private var profiles: [UserProfile]

    var body: some View {
        let goal = profiles.first?.goal ?? .maintain
        let targetCalories = Int(plans.first?.dietPlan.dailyTargets.calories ?? 0)
        let weighIns = wearables.compactMap { summary -> DietPhase.WeighIn? in
            guard let weight = summary.weight, weight > 0 else { return nil }
            return DietPhase.WeighIn(
                date: summary.date,
                weightLbs: weight,
                bodyFatPercent: summary.bodyFatPercent
            )
        }

        if targetCalories > 0, !weighIns.isEmpty {
            let model = metabolicModels.first
            DietPhaseCard(
                assessment: DietPhase.assess(
                    goal: goal,
                    weighIns: weighIns,
                    currentCalories: targetCalories,
                    estimatedTDEE: model.map { Int($0.estimatedTDEE) },
                    tdeeConfidence: model.map { Int($0.confidence) }
                ),
                currentCalories: targetCalories
            )
        }
    }
}

/// Where the diet actually stands — trend weight, weekly rate, and what should change.
///
/// The scale number people react to is mostly water. This shows the trend and judges the
/// *rate*, which is the part that decides whether the weight coming off is fat or muscle.
///
/// Mirrors web `DietPhaseCard.tsx`.
struct DietPhaseCard: View {
    let assessment: DietPhase.Assessment
    let currentCalories: Int

    private var trend: DietPhase.Trend { assessment.trend }

    private var verdictTint: Color {
        switch assessment.rateVerdict {
        case .onTrack: return .appAccent
        case .tooFast, .wrongDirection: return .appTerracotta
        case .tooSlow, .stalled: return .appWarm
        }
    }

    private var verdictLabel: String {
        switch assessment.rateVerdict {
        case .onTrack: return "On track"
        case .tooFast: return "Too fast"
        case .tooSlow: return "Too slow"
        case .stalled: return "Stalled"
        case .wrongDirection: return "Off course"
        }
    }

    private var rateLabel: String {
        if trend.weeklyChangeLbs == 0 { return "holding steady" }
        let sign = trend.weeklyChangeLbs > 0 ? "+" : "−"
        return "\(sign)\(String(format: "%.1f", abs(trend.weeklyChangeLbs))) lb/week"
    }

    var body: some View {
        if trend.weighInCount > 0 {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text((assessment.suggestedPhase ?? assessment.phase).label.uppercased())
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.appAccent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.appAccent.opacity(0.12), in: Capsule())

                    if trend.reliable {
                        Text(verdictLabel.uppercased())
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(verdictTint)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(verdictTint.opacity(0.12), in: Capsule())
                    }
                    Spacer(minLength: 0)
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(String(format: "%.1f", trend.trendWeightLbs))
                            .font(.title2.weight(.semibold))
                            .monospacedDigit()
                        Text("lb trend")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text("Last weigh-in \(String(format: "%.1f", trend.latestWeightLbs)) lb · \(rateLabel)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Text(assessment.headline)
                    .font(.subheadline.weight(.medium))
                    .fixedSize(horizontal: false, vertical: true)

                ForEach(assessment.details, id: \.self) { detail in
                    Text(detail)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if assessment.calorieAdjustment != 0 {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Suggested target")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        HStack(spacing: 6) {
                            Text("\(currentCalories + assessment.calorieAdjustment) kcal/day")
                                .font(.subheadline.weight(.semibold))
                            Text("(\(assessment.calorieAdjustment > 0 ? "+" : "")\(assessment.calorieAdjustment))")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                }
            }
            .padding()
            .background(Color.recompSurface, in: RoundedRectangle(cornerRadius: 12))
        }
    }
}
