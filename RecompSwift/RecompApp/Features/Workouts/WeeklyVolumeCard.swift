import SwiftUI
import RefactorKit

/// Hard sets per muscle this week against MEV/MRV landmarks.
///
/// This is the number that most often explains a stalled physique: the scale moves,
/// lifts climb, but a group like hamstrings or rear delts never clears its minimum.
///
/// Mirrors web `WeeklyVolumeCard.tsx`.
struct WeeklyVolumeCard: View {
    let summary: MuscleVolume.Summary

    private var trained: [MuscleVolume.Entry] { summary.entries.filter { $0.sets > 0 } }
    private var untouched: [MuscleVolume.Entry] { summary.entries.filter { $0.sets == 0 } }

    var body: some View {
        if summary.totalHardSets > 0 {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Weekly volume")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("\(summary.totalHardSets) hard sets")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                ForEach(trained, id: \.muscle) { entry in
                    VolumeRow(entry: entry)
                }

                if !summary.overdosed.isEmpty {
                    Text("Past the recoverable ceiling: \(summary.overdosed.map(\.label).joined(separator: ", ")). Trim sets here rather than adding more.")
                        .font(.caption2)
                        .foregroundStyle(Color.appTerracotta)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !untouched.isEmpty {
                    Text("No sets logged this week: \(untouched.map(\.muscle.label).joined(separator: ", ")).")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !summary.unclassifiedExercises.isEmpty {
                    Text("Not counted (unrecognized): \(summary.unclassifiedExercises.joined(separator: ", "))")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding()
            .background(Color.recompSurface, in: RoundedRectangle(cornerRadius: 12))
        }
    }
}

private struct VolumeRow: View {
    let entry: MuscleVolume.Entry

    private var tint: Color {
        switch entry.status {
        case .under: return .appWarm
        case .optimal, .high: return .appAccent
        case .over: return .appTerracotta
        }
    }

    /// Bars are scaled against MRV so every group shares one visual scale.
    private var fillFraction: Double {
        guard entry.landmarks.mrv > 0 else { return 0 }
        return min(1, entry.sets / Double(entry.landmarks.mrv))
    }

    private var mevFraction: Double {
        guard entry.landmarks.mrv > 0 else { return 0 }
        return min(1, Double(entry.landmarks.mev) / Double(entry.landmarks.mrv))
    }

    private var setsLabel: String {
        entry.sets == entry.sets.rounded() ? String(Int(entry.sets)) : String(format: "%.1f", entry.sets)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(entry.muscle.label)
                    .font(.caption.weight(.medium))
                Spacer()
                Text("\(setsLabel) / \(entry.landmarks.mev)–\(entry.landmarks.mrv) sets")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.secondary.opacity(0.15))
                    Capsule()
                        .fill(tint)
                        .frame(width: geo.size.width * fillFraction)
                    // MEV marker — the line that must be cleared for the work to count.
                    Rectangle()
                        .fill(Color.secondary.opacity(0.5))
                        .frame(width: 1)
                        .offset(x: geo.size.width * mevFraction)
                }
            }
            .frame(height: 6)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(entry.muscle.label): \(setsLabel) sets, target \(entry.landmarks.mev) to \(entry.landmarks.mrv)")
    }
}
