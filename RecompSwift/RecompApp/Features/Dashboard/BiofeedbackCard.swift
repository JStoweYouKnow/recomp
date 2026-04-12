import SwiftUI
import SwiftData
import RefactorKit

struct BiofeedbackCard: View {
    @Environment(\.modelContext) private var context
    @State private var energy = 3
    @State private var mood = 3
    @State private var hunger = 3
    @State private var stress = 3
    @State private var soreness = 3
    @State private var hasLogged = false

    var body: some View {
        GroupBox {
            if hasLogged {
                VStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .font(.title3)
                    Text("Logged today")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                VStack(spacing: 6) {
                    feedbackRow("Energy", value: $energy, icon: "bolt.fill", color: .yellow)
                    feedbackRow("Mood", value: $mood, icon: "face.smiling", color: .green)
                    feedbackRow("Hunger", value: $hunger, icon: "fork.knife", color: .orange)
                    feedbackRow("Stress", value: $stress, icon: "brain", color: .red)
                    feedbackRow("Sore", value: $soreness, icon: "figure.walk", color: .purple)

                    Button("Log") {
                        let entry = BiofeedbackEntry(
                            date: DateHelpers.todayString(),
                            time: DateHelpers.timeString(from: .now),
                            energy: energy,
                            mood: mood,
                            hunger: hunger,
                            stress: stress,
                            soreness: soreness
                        )
                        context.insert(entry)
                        hasLogged = true
                    }
                    .font(.caption.weight(.medium))
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                }
            }
        } label: {
            Label("Biofeedback", systemImage: "heart.text.square")
                .font(.caption.weight(.medium))
        }
    }

    private func feedbackRow(_ label: String, value: Binding<Int>, icon: String, color: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 9))
                .foregroundStyle(color)
                .frame(width: 14)
            Text("\(value.wrappedValue)")
                .font(.system(size: 10, design: .rounded).weight(.medium))
                .frame(width: 14)
            Slider(value: Binding(
                get: { Double(value.wrappedValue) },
                set: { value.wrappedValue = Int($0) }
            ), in: 1...5, step: 1)
            .tint(color)
        }
    }
}
