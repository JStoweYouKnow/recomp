import SwiftUI
import RefactorKit

/// Where the lifter is in the current training block.
///
/// Without this, a multi-week program is an undifferentiated wall of sessions. Naming the
/// phase is what makes a lighter week read as strategy rather than as falling behind.
///
/// Mirrors web `MesocycleBanner.tsx`.
struct MesocycleBanner: View {
    let resolution: Mesocycle.Resolution

    private var state: Mesocycle.State { resolution.state }

    private var tint: Color {
        switch state.phase {
        case .accumulation: return .appAccent
        case .peak: return .appSage
        case .deload: return .appWarm
        }
    }

    private var showWarning: Bool {
        resolution.deload.urgency == .soon && !resolution.deloadForced
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(state.phase.label.uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(tint.opacity(0.12), in: Capsule())

                Text("Week \(state.weekInBlock) of \(state.blockLength)")
                    .font(.subheadline.weight(.medium))

                Text("Block \(state.blockNumber)")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if resolution.deloadForced {
                    Text("Pulled forward")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.appWarm)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.appWarm.opacity(0.15), in: Capsule())
                }

                Spacer(minLength: 0)
            }

            Text(state.summary)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            // Week dots make the block's shape legible at a glance.
            HStack(spacing: 4) {
                ForEach(1...max(1, state.blockLength), id: \.self) { week in
                    Capsule()
                        .fill(dotColor(week: week))
                        .frame(height: 5)
                }
            }
            .accessibilityHidden(true)

            if (resolution.deloadForced || showWarning), !resolution.deload.reasons.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text(resolution.deloadForced ? "Why this week is a deload" : "A deload is coming")
                        .font(.caption.weight(.semibold))
                    ForEach(resolution.deload.reasons, id: \.self) { reason in
                        Text("• \(reason)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
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

    private func dotColor(week: Int) -> Color {
        if week == state.weekInBlock { return .appAccent }
        if week < state.weekInBlock { return Color.appAccent.opacity(0.4) }
        if week == state.blockLength { return Color.appWarm.opacity(0.3) }
        return Color.secondary.opacity(0.15)
    }
}
