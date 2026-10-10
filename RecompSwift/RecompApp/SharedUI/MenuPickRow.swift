import SwiftUI
import RefactorKit

/// A restaurant menu item ranked against the remaining macro budget, with a
/// "macro approved" badge and one-tap logging. Used by menu scan and The Ref's
/// restaurant recommendations.
struct MenuPickRow: View {
    let pick: MenuPick
    var isLogged = false
    var onEdit: (() -> Void)? = nil
    let onLog: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Button {
                onEdit?()
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(pick.name)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                        if pick.isApproved {
                            Text("Macro approved")
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.appAccent, in: Capsule())
                                .foregroundStyle(.white)
                                .fixedSize()
                        }
                    }
                    Text(macroLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let reason = pick.fitReason, !reason.isEmpty {
                        Text(reason)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .disabled(onEdit == nil)

            Button(isLogged ? "Logged" : "Log") {
                Haptics.success()
                onLog()
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.appAccent)
            .controlSize(.small)
            .disabled(isLogged)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(pick.name), \(macroLine)\(pick.isApproved ? ", macro approved" : "")")
    }

    private var macroLine: String {
        let m = pick.estimatedMacros
        let est = pick.source == "official" ? "" : " · est."
        return "\(m.calories) cal · \(Int(m.protein))g P · \(Int(m.carbs))g C · \(Int(m.fat))g F\(est)"
    }
}
