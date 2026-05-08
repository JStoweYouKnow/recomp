import SwiftUI
import SwiftData
import RefactorKit

struct BiofeedbackCard: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @State private var energy = 3
    @State private var mood = 3
    @State private var hunger = 3
    @State private var stress = 3
    @State private var soreness = 3
    @State private var hasLogged = false
    @State private var saveError: String?

    var body: some View {
        GroupBox {
            if hasLogged {
                VStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.appSuccess)
                        .font(.title3)
                    Text("Logged today")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button("Update") {
                        energy = 3; mood = 3; hunger = 3; stress = 3; soreness = 3
                        hasLogged = false
                    }
                    .font(.caption2)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            } else {
                VStack(spacing: 8) {
                    feedbackRow("Energy", value: $energy, icon: "bolt.fill", color: Color.appWarm)
                    feedbackRow("Mood", value: $mood, icon: "face.smiling", color: Color.appSuccess)
                    feedbackRow("Hunger", value: $hunger, icon: "fork.knife", color: Color.appTerracotta)
                    feedbackRow("Stress", value: $stress, icon: "brain", color: Color.appError)
                    feedbackRow("Sore", value: $soreness, icon: "figure.walk", color: Color.appSlate)

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
                        do { try context.save() } catch { saveError = error.localizedDescription }
                        Task { await syncEngine?.markDirty() }
                        hasLogged = true
                    }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .tint(Color.appAccent)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 2)
                }
            }
        } label: {
            Label("Biofeedback", systemImage: "heart.text.square")
                .font(.caption.weight(.medium))
        }
        .alert("Save Failed", isPresented: Binding(
            get: { saveError != nil },
            set: { if !$0 { saveError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(saveError ?? "")
        }
    }

    private func feedbackRow(_ label: String, value: Binding<Int>, icon: String, color: Color) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 9))
                    .foregroundStyle(color)
                Text(label)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.secondary)
                Spacer()
            }
            HStack(spacing: 5) {
                ForEach(1...5, id: \.self) { i in
                    Button {
                        withAnimation(.spring(duration: 0.15)) {
                            value.wrappedValue = i
                        }
                    } label: {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(i <= value.wrappedValue ? color : color.opacity(0.12))
                            .frame(height: 10)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
