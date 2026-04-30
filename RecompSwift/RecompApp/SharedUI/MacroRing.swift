import SwiftUI
import RefactorKit

// MARK: - Macro detail model

struct MacroDetail: Identifiable {
    let id = UUID()
    let label: String
    let current: Double
    let target: Double
    let unit: String
    let color: Color

    var progress: Double { target > 0 ? min(current / target, 1.0) : 0 }
    var pct: Int { Int((progress * 100).rounded()) }
    var remaining: Double { max(target - current, 0) }
    var overBy: Double { max(current - target, 0) }
    var isOver: Bool { current > target && target > 0 }
}

// MARK: - Ring

struct MacroRing: View {
    let current: Double
    let target: Double
    let color: Color
    let label: String
    let unit: String
    var onTap: (() -> Void)? = nil

    private var progress: Double {
        guard target > 0 else { return 0 }
        return min(current / target, 1.0)
    }

    private var isOverTarget: Bool { current > target && target > 0 }

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .stroke(color.opacity(0.15), lineWidth: 7)

                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        isOverTarget ? Color.appError : color,
                        style: StrokeStyle(lineWidth: 7, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .shadow(color: (isOverTarget ? Color.appError : color).opacity(0.35), radius: 3)
                    .animation(.spring(duration: 0.4), value: progress)

                VStack(spacing: 1) {
                    Text("\(Int(current.rounded()))")
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(isOverTarget ? Color.appError : Color.primary)
                    Text(unit)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 70, height: 70)
            .onTapGesture { onTap?() }

            Text(label)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Popup sheet

struct MacroDetailSheet: View {
    let detail: MacroDetail
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 20) {
            // Header
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .stroke(detail.color.opacity(0.2), lineWidth: 5)
                    Circle()
                        .trim(from: 0, to: detail.progress)
                        .stroke(detail.isOver ? Color.appError : detail.color,
                                style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: 48, height: 48)

                VStack(alignment: .leading, spacing: 2) {
                    Text(detail.label)
                        .font(.title3.weight(.bold))
                    Text(detail.isOver ? "Over target" : "\(detail.pct)% of daily goal")
                        .font(.subheadline)
                        .foregroundStyle(detail.isOver ? Color.appError : Color.secondary)
                }
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Divider()

            // Stats grid
            HStack(spacing: 0) {
                statCell(
                    title: "Consumed",
                    value: formatted(detail.current),
                    unit: detail.unit,
                    color: detail.isOver ? .appError : detail.color
                )
                Divider().frame(height: 44)
                statCell(
                    title: "Target",
                    value: formatted(detail.target),
                    unit: detail.unit,
                    color: .secondary
                )
                Divider().frame(height: 44)
                if detail.isOver {
                    statCell(
                        title: "Over by",
                        value: formatted(detail.overBy),
                        unit: detail.unit,
                        color: .appError
                    )
                } else {
                    statCell(
                        title: "Remaining",
                        value: formatted(detail.remaining),
                        unit: detail.unit,
                        color: .appSuccess
                    )
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
    }

    private func statCell(title: String, value: String, unit: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.5)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(.title3, design: .rounded, weight: .black))
                    .monospacedDigit()
                    .foregroundStyle(color)
                Text(unit)
                    .font(.caption)
                    .foregroundStyle(color.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func formatted(_ value: Double) -> String {
        value >= 10 ? "\(Int(value.rounded()))" : String(format: "%.1f", value)
    }
}

// MARK: - Pills row

struct MacroPillsView: View {
    let consumed: Macros
    let target: Macros

    @State private var activeMacro: MacroDetail?

    var body: some View {
        HStack(spacing: 0) {
            MacroRing(current: Double(consumed.calories), target: Double(target.calories), color: .appWarm, label: "Cal", unit: "kcal") {
                activeMacro = MacroDetail(label: "Calories", current: Double(consumed.calories), target: Double(target.calories), unit: "kcal", color: .appWarm)
            }
            Spacer()
            MacroRing(current: consumed.protein, target: target.protein, color: .appAccent, label: "Protein", unit: "g") {
                activeMacro = MacroDetail(label: "Protein", current: consumed.protein, target: target.protein, unit: "g", color: .appAccent)
            }
            Spacer()
            MacroRing(current: consumed.carbs, target: target.carbs, color: .appSage, label: "Carbs", unit: "g") {
                activeMacro = MacroDetail(label: "Carbs", current: consumed.carbs, target: target.carbs, unit: "g", color: .appSage)
            }
            Spacer()
            MacroRing(current: consumed.fat, target: target.fat, color: .appTerracotta, label: "Fat", unit: "g") {
                activeMacro = MacroDetail(label: "Fat", current: consumed.fat, target: target.fat, unit: "g", color: .appTerracotta)
            }
        }
        .padding(.horizontal, 8)
        .sheet(item: $activeMacro) { detail in
            MacroDetailSheet(detail: detail)
                .presentationDetents([.height(220)])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
        }
    }
}

#Preview {
    MacroPillsView(
        consumed: Macros(calories: 1200, protein: 80, carbs: 120, fat: 40),
        target: Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)
    )
    .padding()
}
