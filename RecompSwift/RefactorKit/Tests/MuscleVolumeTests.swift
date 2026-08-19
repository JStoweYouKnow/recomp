import Foundation
import Testing
@testable import RefactorKit

// Mirrors `src/lib/muscle-volume.test.ts` — the engines must agree across platforms.

private func volumeLog(
    _ date: String,
    _ exerciseName: String,
    _ setIndex: Int,
    reps: Int? = 10,
    section: String = "main"
) -> WorkoutSetLogDTO {
    WorkoutSetLogDTO(
        id: "\(date):\(exerciseName):\(setIndex)",
        date: date,
        planId: "plan-1",
        dayLabel: "Monday",
        section: section,
        exerciseName: exerciseName,
        globalSlot: 0,
        setIndex: setIndex,
        weightLbs: 100,
        reps: reps,
        loggedAt: "\(date)T18:00:00.000Z"
    )
}

/// n logged sets of one exercise on one date.
private func volumeSets(_ date: String, _ name: String, _ count: Int) -> [WorkoutSetLogDTO] {
    (0..<count).map { volumeLog(date, name, $0) }
}

private func sets(_ summary: MuscleVolume.Summary, _ muscle: MuscleVolume.MuscleGroup) -> Double {
    summary.entries.first { $0.muscle == muscle }?.sets ?? -1
}

// MARK: - Classification

@Test func classify_resolvesSpecificPatternsBeforeGenericOnes() {
    #expect(MuscleVolume.classify(exerciseName: "Romanian Deadlift").primary == [.hamstrings])
    #expect(MuscleVolume.classify(exerciseName: "Conventional Deadlift").primary == [.back, .hamstrings])
    #expect(MuscleVolume.classify(exerciseName: "Leg Extension").primary == [.quads])
}

@Test func classify_splitsCompoundsIntoPrimaryAndSecondary() {
    let bench = MuscleVolume.classify(exerciseName: "Barbell Bench Press")
    #expect(bench.primary == [.chest])
    #expect(bench.secondary.contains(.triceps))

    let row = MuscleVolume.classify(exerciseName: "Barbell Row")
    #expect(row.primary == [.back])
    #expect(row.secondary.contains(.biceps))
}

@Test func classify_isolationToSingleGroup() {
    #expect(MuscleVolume.classify(exerciseName: "Lateral Raise").primary == [.shoulders])
    #expect(MuscleVolume.classify(exerciseName: "Standing Calf Raise").primary == [.calves])
    #expect(MuscleVolume.classify(exerciseName: "Tricep Pushdown").primary == [.triceps])
}

@Test func classify_prefersTaggedMuscles() {
    let result = MuscleVolume.classify(exerciseName: "Some Machine Press", taggedMuscles: ["lats", "biceps"])
    #expect(result.primary == [.back])
    #expect(result.secondary == [.biceps])
}

@Test func classify_emptyWhenUnplaceable() {
    #expect(MuscleVolume.classify(exerciseName: "Sled Drag").primary.isEmpty)
    #expect(MuscleVolume.classify(exerciseName: "").primary.isEmpty)
}

@Test func normalizeTaggedMuscles_mapsVocabularyAndDropsUnknowns() {
    #expect(MuscleVolume.normalizeTaggedMuscles(["pectorals"]) == [.chest])
    #expect(MuscleVolume.normalizeTaggedMuscles(["lats", "upper back"]) == [.back])
    #expect(MuscleVolume.normalizeTaggedMuscles(["delts"]) == [.shoulders])
    #expect(MuscleVolume.normalizeTaggedMuscles(["cardiovascular system"]).isEmpty)
    #expect(MuscleVolume.normalizeTaggedMuscles(nil).isEmpty)
}

// MARK: - Weekly volume

@Test func weeklyVolume_countsPrimaryFullAndSecondaryHalf() {
    let summary = MuscleVolume.computeWeekly(
        setLogs: volumeSets("2026-07-01", "Bench Press", 4),
        weekStart: "2026-06-29"
    )
    #expect(sets(summary, .chest) == 4)
    #expect(sets(summary, .triceps) == 2)
    #expect(sets(summary, .shoulders) == 2)
    #expect(summary.totalHardSets == 4)
}

@Test func weeklyVolume_excludesWarmupsAndUnloggedSets() {
    let logs = [
        volumeLog("2026-07-01", "Bench Press", 0, section: "warmup"),
        volumeLog("2026-07-01", "Bench Press", 1, reps: nil),
        volumeLog("2026-07-01", "Bench Press", 2),
    ]
    #expect(MuscleVolume.computeWeekly(setLogs: logs, weekStart: "2026-06-29").totalHardSets == 1)
}

@Test func weeklyVolume_onlyCountsSevenDayWindow() {
    let logs = volumeSets("2026-06-28", "Bench Press", 3)
        + volumeSets("2026-06-29", "Bench Press", 3)
        + volumeSets("2026-07-05", "Bench Press", 3)
        + volumeSets("2026-07-06", "Bench Press", 3)
    #expect(MuscleVolume.computeWeekly(setLogs: logs, weekStart: "2026-06-29").totalHardSets == 6)
}

@Test func weeklyVolume_flagsUnderAndOverDosedGroups() {
    let logs = volumeSets("2026-06-29", "Bicep Curl", 30) + volumeSets("2026-06-30", "Bench Press", 10)
    let summary = MuscleVolume.computeWeekly(setLogs: logs, weekStart: "2026-06-29")

    #expect(summary.overdosed.contains(.biceps))
    #expect(summary.underdosed.contains(.hamstrings))
    #expect(!summary.underdosed.contains(.chest))
}

@Test func weeklyVolume_reportsSetsToMev() {
    let summary = MuscleVolume.computeWeekly(
        setLogs: volumeSets("2026-06-29", "Bench Press", 2),
        weekStart: "2026-06-29"
    )
    let chest = summary.entries.first { $0.muscle == .chest }!
    #expect(chest.sets == 2)
    #expect(chest.setsToMev == (MuscleVolume.landmarks[.chest]!.mev - 2))
    #expect(chest.status == .under)
}

@Test func weeklyVolume_scalesLandmarksByTrainingAge() {
    let logs = volumeSets("2026-06-29", "Bench Press", 6)
    let beginner = MuscleVolume.computeWeekly(setLogs: logs, weekStart: "2026-06-29", fitnessLevel: "beginner")
    let advanced = MuscleVolume.computeWeekly(setLogs: logs, weekStart: "2026-06-29", fitnessLevel: "advanced")

    #expect(beginner.entries.first { $0.muscle == .chest }!.status == .optimal)
    #expect(advanced.entries.first { $0.muscle == .chest }!.status == .under)
}

@Test func weeklyVolume_surfacesUnclassifiedExercises() {
    let summary = MuscleVolume.computeWeekly(
        setLogs: volumeSets("2026-06-29", "Sled Drag", 3),
        weekStart: "2026-06-29"
    )
    #expect(summary.unclassifiedExercises == ["Sled Drag"])
    #expect(summary.totalHardSets == 3)
}

@Test func weeklyVolume_usesMuscleLookup() {
    let summary = MuscleVolume.computeWeekly(
        setLogs: volumeSets("2026-06-29", "Mystery Machine", 4),
        weekStart: "2026-06-29",
        muscleLookup: ["mystery machine": ["glutes"]]
    )
    #expect(sets(summary, .glutes) == 4)
    #expect(summary.unclassifiedExercises.isEmpty)
}

// MARK: - Planned volume

@Test func plannedVolume_scoresProgramBeforeLogging() {
    let day = [
        WorkoutExercise(name: "Bench Press", sets: "4", reps: "8-12"),
        WorkoutExercise(name: "Incline Dumbbell Press", sets: "3", reps: "10"),
    ]
    let entries = MuscleVolume.computePlanned(exercisesByDay: [day, day])
    let chest = entries.first { $0.muscle == .chest }!

    #expect(chest.sets == 14)
    #expect(chest.status == .optimal)
}

@Test func plannedVolume_honorsTaggedMuscles() {
    let day = [WorkoutExercise(name: "Unknown Machine", sets: "5", reps: "10", muscles: ["hamstrings"])]
    let entries = MuscleVolume.computePlanned(exercisesByDay: [day])
    #expect(entries.first { $0.muscle == .hamstrings }!.sets == 5)
}

@Test func muscleGroup_labelIsTitleCased() {
    #expect(MuscleVolume.MuscleGroup.hamstrings.label == "Hamstrings")
}
