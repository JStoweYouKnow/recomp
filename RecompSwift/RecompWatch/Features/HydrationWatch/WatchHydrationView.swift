import SwiftUI
import SwiftData
import WatchKit
import RefactorKit

struct WatchHydrationView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine

    @Query(sort: \HydrationEntry.time)
    private var allEntries: [HydrationEntry]

    private var todayKey: String { DateHelpers.todayString() }

    private var todaysEntries: [HydrationEntry] {
        allEntries.filter { $0.date == todayKey }
    }

    private var totalMl: Int {
        todaysEntries.reduce(0) { $0 + $1.amountMl }
    }

    /// Matches iOS `HydrationWidget` until a per-user goal exists in the model.
    private var goalMl: Int { 2500 }

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(.blue.opacity(0.2), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: min(Double(totalMl) / Double(max(goalMl, 1)), 1.0))
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

            HStack(spacing: 6) {
                adjustWaterButton(-250)
                adjustWaterButton(+250)
            }
            HStack(spacing: 6) {
                adjustWaterButton(-500)
                adjustWaterButton(+500)
            }
        }
        .padding()
    }

    @ViewBuilder
    private func adjustWaterButton(_ ml: Int) -> some View {
        let isSubtract = ml < 0
        let label = isSubtract ? "\(ml)" : "+\(ml)"
        let disabled = isSubtract && totalMl + ml < 0

        Button(label) {
            if isSubtract {
                let target = -ml
                if let idx = todaysEntries.indices.reversed().first(where: { todaysEntries[$0].amountMl == target }) {
                    context.delete(todaysEntries[idx])
                } else if let last = todaysEntries.last {
                    context.delete(last)
                }
            } else {
                let entry = HydrationEntry(
                    date: todayKey,
                    time: DateHelpers.timeString(from: .now),
                    amountMl: ml
                )
                context.insert(entry)
            }
            try? context.save()
            WKInterfaceDevice.current().play(.click)
            Task { await syncEngine?.markDirty() }
        }
        .font(.caption2)
        .buttonStyle(.bordered)
        .tint(isSubtract ? .red : .blue)
        .disabled(disabled || (isSubtract && todaysEntries.isEmpty))
    }
}
