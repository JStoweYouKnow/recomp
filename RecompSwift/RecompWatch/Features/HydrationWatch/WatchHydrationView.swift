import SwiftUI
import SwiftData
import WatchKit

struct WatchHydrationView: View {
    @Environment(\.modelContext) private var context
    @State private var totalMl = 0
    private let goalMl = 2500

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(.blue.opacity(0.2), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: Double(totalMl) / Double(goalMl))
                    .stroke(.blue, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Image(systemName: "drop.fill")
                        .foregroundStyle(.blue)
                        .font(.caption)
                    Text("\(totalMl)")
                        .font(.system(.caption, design: .rounded, weight: .bold))
                    Text("ml")
                        .font(.system(size: 8))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 80, height: 80)

            HStack(spacing: 8) {
                Button("+250") { addWater(250) }
                    .font(.caption2)
                    .buttonStyle(.bordered)
                    .tint(.blue)

                Button("+500") { addWater(500) }
                    .font(.caption2)
                    .buttonStyle(.bordered)
                    .tint(.blue)
            }
        }
        .padding()
    }

    private func addWater(_ ml: Int) {
        totalMl += ml
        let entry = HydrationEntry(
            date: DateHelpers.todayString(),
            time: DateHelpers.timeString(from: .now),
            amountMl: ml
        )
        context.insert(entry)
        WKInterfaceDevice.current().play(.click)
    }
}
