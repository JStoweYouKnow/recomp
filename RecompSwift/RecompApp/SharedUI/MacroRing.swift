import SwiftUI
import RefactorKit

struct MacroRing: View {
    let current: Double
    let target: Double
    let color: Color
    let label: String
    let unit: String

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

            Text(label)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
        }
    }
}

struct MacroPillsView: View {
    let consumed: Macros
    let target: Macros

    var body: some View {
        HStack(spacing: 0) {
            MacroRing(current: Double(consumed.calories), target: Double(target.calories), color: .appWarm, label: "Cal", unit: "kcal")
            Spacer()
            MacroRing(current: consumed.protein, target: target.protein, color: .appAccent, label: "Protein", unit: "g")
            Spacer()
            MacroRing(current: consumed.carbs, target: target.carbs, color: .appSage, label: "Carbs", unit: "g")
            Spacer()
            MacroRing(current: consumed.fat, target: target.fat, color: .appTerracotta, label: "Fat", unit: "g")
        }
        .padding(.horizontal, 8)
    }
}

#Preview {
    MacroPillsView(
        consumed: Macros(calories: 1200, protein: 80, carbs: 120, fat: 40),
        target: Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)
    )
    .padding()
}
