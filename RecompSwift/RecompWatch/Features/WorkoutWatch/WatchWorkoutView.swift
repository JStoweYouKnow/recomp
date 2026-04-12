import SwiftUI

struct WatchWorkoutView: View {
    @State private var exercises: [WatchExercise] = [
        WatchExercise(name: "Bench Press", sets: 4, reps: "8-10", completedSets: 0),
        WatchExercise(name: "Rows", sets: 4, reps: "8-10", completedSets: 0),
        WatchExercise(name: "Shoulder Press", sets: 3, reps: "10-12", completedSets: 0),
        WatchExercise(name: "Bicep Curls", sets: 3, reps: "12-15", completedSets: 0),
    ]
    @State private var isWorkoutActive = false

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Label("Workout", systemImage: "dumbbell")
                    .font(.headline)

                if !isWorkoutActive {
                    Button {
                        isWorkoutActive = true
                    } label: {
                        Label("Start Workout", systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                }

                ForEach($exercises) { $exercise in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(exercise.name)
                                .font(.caption)
                                .lineLimit(1)
                            Text("\(exercise.completedSets)/\(exercise.sets) sets")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        if isWorkoutActive {
                            Button {
                                if exercise.completedSets < exercise.sets {
                                    exercise.completedSets += 1
                                }
                            } label: {
                                Image(systemName: exercise.completedSets >= exercise.sets
                                    ? "checkmark.circle.fill"
                                    : "plus.circle")
                                .foregroundStyle(exercise.completedSets >= exercise.sets ? .green : .blue)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 2)
                }

                if isWorkoutActive {
                    Button {
                        isWorkoutActive = false
                    } label: {
                        Label("End Workout", systemImage: "stop.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                }
            }
            .padding()
        }
    }
}

struct WatchExercise: Identifiable {
    let id = UUID()
    let name: String
    let sets: Int
    let reps: String
    var completedSets: Int
}
