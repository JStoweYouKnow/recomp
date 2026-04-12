import SwiftUI
import SwiftData
import RefactorKit

struct WatchBiofeedbackView: View {
    @Environment(\.modelContext) private var context
    @State private var currentField = 0
    @State private var values = [3, 3, 3, 3, 3]
    @State private var saved = false

    private let fields = [
        ("Energy", "bolt.fill", Color.yellow),
        ("Mood", "face.smiling", Color.green),
        ("Hunger", "fork.knife", Color.orange),
        ("Stress", "brain", Color.red),
        ("Soreness", "figure.walk", Color.purple),
    ]

    var body: some View {
        VStack(spacing: 8) {
            if saved {
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title)
                        .foregroundStyle(.green)
                    Text("Logged!")
                        .font(.caption)
                }
            } else {
                let field = fields[currentField]

                Image(systemName: field.1)
                    .font(.title3)
                    .foregroundStyle(field.2)

                Text(field.0)
                    .font(.caption.weight(.semibold))

                Text("\(values[currentField])")
                    .font(.system(.title, design: .rounded, weight: .bold))
                    .focusable()
                    .digitalCrownRotation(
                        Binding(
                            get: { Double(values[currentField]) },
                            set: { values[currentField] = Int($0.clamped(to: 1...5)) }
                        ),
                        from: 1, through: 5, by: 1,
                        sensitivity: .medium,
                        isContinuous: false
                    )

                HStack {
                    ForEach(0..<5) { i in
                        Circle()
                            .fill(i == currentField ? field.2 : .gray.opacity(0.3))
                            .frame(width: 6, height: 6)
                    }
                }

                if currentField < 4 {
                    Button("Next") {
                        withAnimation { currentField += 1 }
                    }
                    .font(.caption2)
                    .buttonStyle(.borderedProminent)
                } else {
                    Button("Save") { saveEntry() }
                        .font(.caption2)
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                }
            }
        }
        .padding()
    }

    private func saveEntry() {
        let entry = BiofeedbackEntry(
            date: DateHelpers.todayString(),
            time: DateHelpers.timeString(from: .now),
            energy: values[0],
            mood: values[1],
            hunger: values[2],
            stress: values[3],
            soreness: values[4]
        )
        context.insert(entry)
        saved = true
    }
}

extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
