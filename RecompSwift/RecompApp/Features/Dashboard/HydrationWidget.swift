import SwiftUI
import SwiftData
import RefactorKit

struct HydrationWidget: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \HydrationEntry.time) private var allEntries: [HydrationEntry]

    private var todaysEntries: [HydrationEntry] {
        let today = DateHelpers.todayString()
        return allEntries.filter { $0.date == today }
    }

    private var totalMl: Int {
        todaysEntries.reduce(0) { $0 + $1.amountMl }
    }

    private var goalMl: Int { 2500 }

    var body: some View {
        GroupBox {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .stroke(Color.appAccent.opacity(0.2), lineWidth: 5)
                    Circle()
                        .trim(from: 0, to: Double(totalMl) / Double(goalMl))
                        .stroke(Color.appAccent, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Image(systemName: "drop.fill")
                        .font(.title3)
                        .foregroundStyle(Color.appAccent)
                }
                .frame(width: 50, height: 50)

                Text("\(totalMl) ml")
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()

                HStack(spacing: 6) {
                    adjustButton(-250)
                    adjustButton(+250)
                }
                HStack(spacing: 6) {
                    adjustButton(-500)
                    adjustButton(+500)
                }
            }
        } label: {
            Label("Hydration", systemImage: "drop")
                .font(.caption.weight(.medium))
        }
    }

    private func adjustButton(_ ml: Int) -> some View {
        let isSubtract = ml < 0
        let label = isSubtract ? "\(ml)" : "+\(ml)"
        let wouldGoNegative = isSubtract && totalMl + ml < 0

        return Button {
            if isSubtract {
                // Remove the most recent entry with this magnitude, or the closest one.
                let target = -ml
                if let idx = todaysEntries.indices.reversed().first(where: { todaysEntries[$0].amountMl == target }) {
                    context.delete(todaysEntries[idx])
                } else if let last = todaysEntries.last {
                    context.delete(last)
                }
            } else {
                let entry = HydrationEntry(
                    date: DateHelpers.todayString(),
                    time: DateHelpers.timeString(from: .now),
                    amountMl: ml
                )
                context.insert(entry)
            }
        } label: {
            Text(label)
                .font(.caption2.weight(.medium))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    (isSubtract ? Color.red : Color.appAccent).opacity(0.1),
                    in: Capsule()
                )
                .foregroundStyle(isSubtract ? Color.red : Color.appAccent)
        }
        .buttonStyle(.plain)
        .disabled(wouldGoNegative || (isSubtract && todaysEntries.isEmpty))
    }
}
