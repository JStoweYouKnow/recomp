import Foundation
import Testing
import SwiftData
@testable import RefactorKit

// MARK: - Helpers

private func makeContext() throws -> ModelContext {
    let container = try RefactorSchema.makeContainerNonisolated(inMemory: true)
    return ModelContext(container)
}

private func makeDTO(
    id: String = "user-1",
    name: String = "Alice",
    weight: Double = 150,
    gender: String = "male",
    proAccess: Bool? = nil
) -> UserProfileDTO {
    UserProfileDTO(
        id: id,
        name: name,
        email: "alice@example.com",
        age: 30,
        weight: weight,
        height: 70,
        gender: gender,
        fitnessLevel: "beginner",
        goal: "maintain",
        proAccess: proAccess
    )
}

// MARK: - A. upsert insert + update same row

@Test func upsert_insertsSingleRowWithMatchingFields() throws {
    let context = try makeContext()
    let result = UserProfile.upsert(from: makeDTO(), in: context)

    let rows = try context.fetch(FetchDescriptor<UserProfile>())
    #expect(rows.count == 1)
    #expect(result.id == "user-1")
    #expect(result.name == "Alice")
    #expect(result.weight == 150)
    #expect(result.gender == .male)
    #expect(result.goal == .maintain)
    #expect(result.fitnessLevel == .beginner)
}

@Test func upsert_updatesSameRowPreservingIdentity() throws {
    let context = try makeContext()
    let first = UserProfile.upsert(from: makeDTO(name: "Alice", weight: 150, proAccess: false), in: context)
    let firstPersistentID = first.persistentModelID

    let second = UserProfile.upsert(
        from: makeDTO(name: "Alicia", weight: 142.5, proAccess: true),
        in: context
    )

    let rows = try context.fetch(FetchDescriptor<UserProfile>())
    #expect(rows.count == 1)
    #expect(second.persistentModelID == firstPersistentID)
    #expect(first === second)
    #expect(second.name == "Alicia")
    #expect(second.weight == 142.5)
    #expect(second.proAccess == true)
}

// MARK: - B. unknown enum raw value preserves prior valid value

@Test func upsert_unknownEnumPreservesExistingValue() throws {
    let context = try makeContext()
    _ = UserProfile.upsert(from: makeDTO(gender: "female"), in: context)

    let updated = UserProfile.upsert(from: makeDTO(gender: "zzz"), in: context)

    #expect(updated.gender == .female)
    let rows = try context.fetch(FetchDescriptor<UserProfile>())
    #expect(rows.count == 1)
}

// MARK: - C. proAccess round-trips

@Test func proAccess_roundTripsThroughToDTO() throws {
    let profile = UserProfile(
        id: "pro-user",
        name: "Pro",
        age: 28,
        weight: 180,
        height: 72,
        gender: .other,
        fitnessLevel: .advanced,
        goal: .buildMuscle,
        proAccess: true
    )
    let dto = profile.toDTO()
    #expect(dto.proAccess == true)
}

@Test func upsert_proAccessTrueYieldsProRow() throws {
    let context = try makeContext()
    let result = UserProfile.upsert(from: makeDTO(proAccess: true), in: context)
    #expect(result.proAccess == true)
}

// MARK: - D. wipeAll clears all rows

@Test func wipeAll_removesAllPersistedRows() throws {
    let context = try makeContext()

    context.insert(UserProfile(
        id: "u1", name: "A", age: 30, weight: 150, height: 70,
        gender: .male, fitnessLevel: .beginner, goal: .maintain
    ))
    context.insert(UserProfile(
        id: "u2", name: "B", age: 40, weight: 160, height: 68,
        gender: .female, fitnessLevel: .intermediate, goal: .loseWeight
    ))
    context.insert(MealEntry(
        id: "m1", date: "2026-05-29", mealType: .breakfast,
        name: "Oats", macros: Macros(calories: 300, protein: 10, carbs: 50, fat: 5)
    ))
    context.insert(MealEntry(
        id: "m2", date: "2026-05-29", mealType: .lunch,
        name: "Salad", macros: .zero
    ))
    try context.save()

    #expect(try context.fetch(FetchDescriptor<UserProfile>()).count == 2)
    #expect(try context.fetch(FetchDescriptor<MealEntry>()).count == 2)

    LocalStore.wipeAll(context)

    #expect(try context.fetch(FetchDescriptor<UserProfile>()).isEmpty)
    #expect(try context.fetch(FetchDescriptor<MealEntry>()).isEmpty)
}

// MARK: - F. container smoke test

@Test func makeContainerNonisolated_inMemoryDoesNotThrow() throws {
    _ = try RefactorSchema.makeContainerNonisolated(inMemory: true)
}
