import SwiftUI
import RefactorKit

// MARK: - Macro detail model

struct MacroDetail: Identifiable, Equatable {
    var id: String { label }
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

    private let ringSize: CGFloat = 70

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
                    .frame(width: ringSize, height: ringSize)

                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        isOverTarget ? Color.appError : color,
                        style: StrokeStyle(lineWidth: 7, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .frame(width: ringSize, height: ringSize)
                    .shadow(color: (isOverTarget ? Color.appError : color).opacity(0.35), radius: 3)

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
            .frame(width: ringSize, height: ringSize)
            .clipShape(Circle())
            .contentShape(Circle())
            .accessibilityAddTraits(onTap != nil ? .isButton : [])
            .onTapGesture { onTap?() }

            Text(label)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Detail panel (overlay — avoids iOS 26 full-screen sheet expansion)

struct MacroDetailPanel: View {
    let detail: MacroDetail
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            HStack(spacing: 12) {
                macroMiniRing
                VStack(alignment: .leading, spacing: 2) {
                    Text(detail.label)
                        .font(.title3.weight(.bold))
                    Text(detail.isOver ? "Over target" : "\(detail.pct)% of daily goal")
                        .font(.subheadline)
                        .foregroundStyle(detail.isOver ? Color.appError : Color.secondary)
                }
                Spacer(minLength: 0)
                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Divider()

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
        .frame(maxWidth: 420)
        .fixedSize(horizontal: false, vertical: true)
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 16, y: 8)
        .accessibilityElement(children: .contain)
    }

    private var macroMiniRing: some View {
        ZStack {
            Circle()
                .stroke(detail.color.opacity(0.2), lineWidth: 5)
                .frame(width: 48, height: 48)
            Circle()
                .trim(from: 0, to: detail.progress)
                .stroke(
                    detail.isOver ? Color.appError : detail.color,
                    style: StrokeStyle(lineWidth: 5, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .frame(width: 48, height: 48)
        }
        .frame(width: 48, height: 48)
        .clipShape(Circle())
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
    @Binding var activeMacro: MacroDetail?

    var body: some View {
        HStack(spacing: 0) {
            MacroRing(current: Double(consumed.calories), target: Double(target.calories), color: .appWarm, label: "Cal", unit: "kcal") {
                presentDetail(MacroDetail(label: "Calories", current: Double(consumed.calories), target: Double(target.calories), unit: "kcal", color: .appWarm))
            }
            Spacer()
            MacroRing(current: consumed.protein, target: target.protein, color: .appAccent, label: "Protein", unit: "g") {
                presentDetail(MacroDetail(label: "Protein", current: consumed.protein, target: target.protein, unit: "g", color: .appAccent))
            }
            Spacer()
            MacroRing(current: consumed.carbs, target: target.carbs, color: .appSage, label: "Carbs", unit: "g") {
                presentDetail(MacroDetail(label: "Carbs", current: consumed.carbs, target: target.carbs, unit: "g", color: .appSage))
            }
            Spacer()
            MacroRing(current: consumed.fat, target: target.fat, color: .appTerracotta, label: "Fat", unit: "g") {
                presentDetail(MacroDetail(label: "Fat", current: consumed.fat, target: target.fat, unit: "g", color: .appTerracotta))
            }
        }
        .padding(.horizontal, 8)
    }

    private func presentDetail(_ detail: MacroDetail) {
        Task { @MainActor in
            await Task.yield()
            if activeMacro?.id == detail.id {
                activeMacro = nil
            } else {
                activeMacro = detail
            }
        }
    }
}

extension View {
    /// Compact macro breakdown — custom overlay instead of `.sheet` (full-screen on first tap on iOS 26).
    func macroDetailOverlay(_ activeMacro: Binding<MacroDetail?>) -> some View {
        overlay {
            if let detail = activeMacro.wrappedValue {
                ZStack {
                    Color.black.opacity(0.35)
                        .ignoresSafeArea()
                        .onTapGesture {
                            withAnimation(.easeOut(duration: 0.2)) { activeMacro.wrappedValue = nil }
                        }
                        .accessibilityLabel("Dismiss macro details")
                        .accessibilityAddTraits(.isButton)

                    MacroDetailPanel(detail: detail) {
                        withAnimation(.easeOut(duration: 0.2)) { activeMacro.wrappedValue = nil }
                    }
                    .padding(.horizontal, 16)
                    .transition(.scale(scale: 0.92).combined(with: .opacity))
                }
                .zIndex(50)
            }
        }
        .animation(.spring(duration: 0.28, bounce: 0.15), value: activeMacro.wrappedValue?.id)
    }
}

#Preview {
    @Previewable @State var active: MacroDetail?
    MacroPillsView(
        consumed: Macros(calories: 1200, protein: 80, carbs: 120, fat: 40),
        target: Macros(calories: 2000, protein: 150, carbs: 200, fat: 65),
        activeMacro: $active
    )
    .macroDetailOverlay($active)
    .padding()
}
