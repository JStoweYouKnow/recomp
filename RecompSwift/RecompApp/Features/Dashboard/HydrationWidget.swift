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
                        .stroke(.blue.opacity(0.2), lineWidth: 5)
                    Circle()
                        .trim(from: 0, to: Double(totalMl) / Double(goalMl))
                        .stroke(.blue, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Image(systemName: "drop.fill")
                        .font(.title3)
                        .foregroundStyle(.blue)
                }
                .frame(width: 50, height: 50)

                Text("\(totalMl) ml")
                    .font(.caption.weight(.semibold))

                HStack(spacing: 8) {
                    quickAddButton(250)
                    quickAddButton(500)
                }
            }
        } label: {
            Label("Hydration", systemImage: "drop")
                .font(.caption.weight(.medium))
        }
    }

    private func quickAddButton(_ ml: Int) -> some View {
        Button {
            let entry = HydrationEntry(
                date: DateHelpers.todayString(),
                time: DateHelpers.timeString(from: .now),
                amountMl: ml
            )
            context.insert(entry)
        } label: {
            Text("+\(ml)")
                .font(.caption2.weight(.medium))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(.blue.opacity(0.1), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}
