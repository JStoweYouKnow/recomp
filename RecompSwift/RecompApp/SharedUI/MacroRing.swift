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

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(color.opacity(0.2), lineWidth: 6)

                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(color, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))

                VStack(spacing: 0) {
                    Text("\(Int(current))")
                        .font(.system(.caption, design: .rounded, weight: .bold))
                    Text(unit)
                        .font(.system(size: 8))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 52, height: 52)

            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

struct MacroPillsView: View {
    let consumed: Macros
    let target: Macros

    var body: some View {
        HStack(spacing: 12) {
            MacroRing(current: Double(consumed.calories), target: Double(target.calories), color: .orange, label: "Cal", unit: "kcal")
            MacroRing(current: consumed.protein, target: target.protein, color: .red, label: "Protein", unit: "g")
            MacroRing(current: consumed.carbs, target: target.carbs, color: .blue, label: "Carbs", unit: "g")
            MacroRing(current: consumed.fat, target: target.fat, color: .yellow, label: "Fat", unit: "g")
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
