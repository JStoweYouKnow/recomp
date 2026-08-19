import SwiftUI
import RefactorKit

/// The computed target for an exercise's next session — the concrete "what to do today" line.
/// Renders nothing when there is no history to progress from, so untracked exercises stay quiet.
///
/// Mirrors web `src/components/workouts/ProgressionTarget.tsx`.
struct ProgressionTargetView: View {
    let prescription: Progression.SetPrescription?

    private var tint: Color {
        guard let prescription else { return .secondary }
        switch prescription.action {
        case .addLoad, .addReps: return .appAccent
        case .hold, .deload: return .appWarm
        case .establishBaseline: return .appSlate
        }
    }

    var body: some View {
        if let prescription, shouldRender(prescription) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(prescription.action.displayLabel.uppercased())
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(tint)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(tint.opacity(0.12), in: Capsule())

                    if let target = prescription.targetDisplay {
                        HStack(spacing: 4) {
                            Text(target)
                                .font(.subheadline.weight(.semibold))
                            Text("× \(prescription.targetSets) sets")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Text("Set your baseline")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.secondary)
                    }

                    if let rpe = prescription.targetRpe, prescription.targetDisplay != nil {
                        Text("@ RPE \(Int(rpe))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                Text(prescription.rationale)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if let previous = prescription.previous, let weight = previous.weightLbs {
                    Text("Last: \(Int(weight)) lb × \(previous.reps ?? 0)\(previous.rpe.map { " @ RPE \(Int($0))" } ?? "") on \(previous.date)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.recompSurface, in: RoundedRectangle(cornerRadius: 8))
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibilityText(prescription))
        }
    }

    /// Timed/bodyweight work produces a hold with no load — nothing useful to show.
    private func shouldRender(_ prescription: Progression.SetPrescription) -> Bool {
        !(prescription.action == .hold && prescription.targetWeightLbs == nil)
    }

    private func accessibilityText(_ prescription: Progression.SetPrescription) -> String {
        let target = prescription.targetDisplay.map { "Target \($0) for \(prescription.targetSets) sets. " } ?? ""
        return "\(prescription.action.displayLabel). \(target)\(prescription.rationale)"
    }
}
