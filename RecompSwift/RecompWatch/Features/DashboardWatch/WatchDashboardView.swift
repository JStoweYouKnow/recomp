import SwiftUI
import SwiftData

struct WatchDashboardView: View {
    @State private var caloriesConsumed = 0
    @State private var calorieTarget = 2000
    @State private var protein: Double = 0
    @State private var proteinTarget: Double = 150
    @State private var streakDays = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("Recomp")
                    .font(.headline)

                calorieRing

                HStack(spacing: 16) {
                    miniRing(current: protein, target: proteinTarget, color: .red, label: "P")
                    miniRing(current: Double(caloriesConsumed), target: Double(calorieTarget), color: .orange, label: "C")
                }

                if streakDays > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "flame.fill")
                            .foregroundStyle(.orange)
                            .font(.caption2)
                        Text("\(streakDays) day streak")
                            .font(.caption2)
                    }
                }
            }
            .padding()
        }
    }

    private var calorieRing: some View {
        let remaining = max(calorieTarget - caloriesConsumed, 0)
        let progress = min(Double(caloriesConsumed) / Double(max(calorieTarget, 1)), 1.0)

        return ZStack {
            Circle()
                .stroke(.orange.opacity(0.2), lineWidth: 8)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(.orange, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(remaining)")
                    .font(.system(.title3, design: .rounded, weight: .bold))
                Text("cal left")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 100, height: 100)
    }

    private func miniRing(current: Double, target: Double, color: Color, label: String) -> some View {
        let progress = min(current / max(target, 1), 1.0)
        return ZStack {
            Circle()
                .stroke(color.opacity(0.2), lineWidth: 4)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(color)
        }
        .frame(width: 36, height: 36)
    }
}
