import SwiftData
import SwiftUI
import RefactorKit

/// Local edits to one day in the weekly plan; saved into [FitnessPlan] and pushed via `SyncEngine.markDirty()`.
struct EditWorkoutDayView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Environment(\.syncEngine) private var syncEngine

    let plan: FitnessPlan
    let planIndex: Int

    @State private var dayLabel: String = ""
    @State private var focus: String = ""
    @State private var warmups: [WorkoutExercise] = []
    @State private var exercises: [WorkoutExercise] = []
    @State private var finishers: [WorkoutExercise] = []
    @State private var saveError: String?

    var body: some View {
        Form {
            Section("Day") {
                TextField("Day label", text: $dayLabel)
                TextField("Focus", text: $focus)
            }

            exerciseSection(title: "Warm-up", items: $warmups, addLabel: "Add warm-up")
            exerciseSection(title: "Main", items: $exercises, addLabel: "Add exercise")
            exerciseSection(title: "Finisher", items: $finishers, addLabel: "Add finisher")
        }
        .navigationTitle("Edit workout")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }
                    .fontWeight(.semibold)
            }
        }
        .onAppear {
            loadFromPlan()
        }
        .alert("Could not save", isPresented: Binding(
            get: { saveError != nil },
            set: { if !$0 { saveError = nil } }
        )) {
            Button("OK", role: .cancel) { saveError = nil }
        } message: {
            Text(saveError ?? "")
        }
    }

    private func loadFromPlan() {
        let days = plan.workoutPlan.weeklyPlan
        guard planIndex >= 0, planIndex < days.count else { return }
        let d = days[planIndex]
        dayLabel = d.day
        focus = d.focus
        warmups = d.warmups ?? []
        exercises = d.exercises
        finishers = d.finishers ?? []
    }

    private func save() {
        var weekly = plan.workoutPlan.weeklyPlan
        guard planIndex >= 0, planIndex < weekly.count else { return }

        weekly[planIndex] = WorkoutDay(
            day: dayLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? weekly[planIndex].day : dayLabel,
            focus: focus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? weekly[planIndex].focus : focus,
            warmups: warmups.isEmpty ? nil : warmups,
            exercises: exercises,
            finishers: finishers.isEmpty ? nil : finishers
        )

        plan.workoutPlan = WorkoutPlan(
            weeklyPlan: weekly,
            tips: plan.workoutPlan.tips,
            programWeek1Start: plan.workoutPlan.programWeek1Start
        )

        do {
            try modelContext.save()
            Task { await syncEngine?.markDirty() }
            dismiss()
        } catch {
            saveError = error.localizedDescription
        }
    }

    @ViewBuilder
    private func exerciseSection(title: String, items: Binding<[WorkoutExercise]>, addLabel: String) -> some View {
        Section {
            ForEach(Array(items.wrappedValue.indices), id: \.self) { idx in
                exerciseEditor(binding: exerciseBinding(items: items, index: idx))
            }
            .onDelete { offsets in
                items.wrappedValue.remove(atOffsets: offsets)
            }

            Button {
                items.wrappedValue.append(
                    WorkoutExercise(name: "New exercise", sets: "3", reps: "10", notes: nil)
                )
            } label: {
                Label(addLabel, systemImage: "plus.circle.fill")
            }
        } header: {
            Text(title)
        }
    }

    private func exerciseEditor(binding: Binding<WorkoutExercise>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Exercise name", text: Binding(
                get: { binding.wrappedValue.name },
                set: { binding.wrappedValue.name = $0 }
            ))
            HStack {
                TextField("Sets", text: Binding(
                    get: { binding.wrappedValue.sets },
                    set: { binding.wrappedValue.sets = $0 }
                ))
                .keyboardType(.asciiCapable)
                TextField("Reps", text: Binding(
                    get: { binding.wrappedValue.reps },
                    set: { binding.wrappedValue.reps = $0 }
                ))
                .keyboardType(.asciiCapable)
            }
            .font(.subheadline)

            TextField("Notes (optional)", text: Binding(
                get: { binding.wrappedValue.notes ?? "" },
                set: { binding.wrappedValue.notes = $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
            ))
            .font(.caption)
        }
        .padding(.vertical, 4)
    }

    private func exerciseBinding(items: Binding<[WorkoutExercise]>, index: Int) -> Binding<WorkoutExercise> {
        Binding(
            get: { items.wrappedValue[index] },
            set: { items.wrappedValue[index] = $0 }
        )
    }
}
