import SwiftUI
import SwiftData
import RefactorKit

struct WorkoutsView: View {
    @Environment(\.modelContext) private var context
    @State private var planService = PlanService()
    @State private var workoutService = WorkoutService()
    @State private var selectedDate = Date.now

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    CalendarStripView(selectedDate: $selectedDate)

                    if let plan = planService.currentPlan(context: context) {
                        ForEach(plan.workoutPlan.weeklyPlan) { day in
                            WorkoutDayCard(
                                day: day,
                                workoutService: workoutService
                            )
                        }
                    } else {
                        EmptyStateView(
                            icon: "dumbbell",
                            title: "No Workout Plan",
                            subtitle: "Generate a plan to see your weekly workouts"
                        )
                    }
                }
                .padding(.vertical)
            }
            .navigationTitle("Workouts")
        }
    }
}

struct WorkoutDayCard: View {
    let day: WorkoutDay
    let workoutService: WorkoutService
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.spring(duration: 0.3)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(day.day)
                            .font(.headline)
                        Text(day.focus)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(day.exercises.count) exercises")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Image(systemName: "chevron.right")
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .foregroundStyle(.secondary)
                }
                .padding()
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                Divider()

                VStack(spacing: 0) {
                    if let warmups = day.warmups, !warmups.isEmpty {
                        exerciseSection("Warm-up", exercises: warmups, color: .orange)
                    }

                    exerciseSection("Main", exercises: day.exercises, color: .blue)

                    if let finishers = day.finishers, !finishers.isEmpty {
                        exerciseSection("Finisher", exercises: finishers, color: .purple)
                    }
                }
                .padding(.bottom, 8)
            }
        }
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    private func exerciseSection(_ title: String, exercises: [WorkoutExercise], color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
                .padding(.horizontal)
                .padding(.top, 8)

            ForEach(exercises.indices, id: \.self) { i in
                let exercise = exercises[i]
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(exercise.name)
                            .font(.subheadline)
                        Text("\(exercise.sets) × \(exercise.reps)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let notes = exercise.notes {
                        Text(notes)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 4)
            }
        }
    }
}
