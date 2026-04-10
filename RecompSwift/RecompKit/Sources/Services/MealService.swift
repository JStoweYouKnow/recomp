import Foundation
import SwiftData
import Observation

@MainActor
@Observable
public final class MealService {
    private(set) var isLoading = false
    private(set) var suggestions: [SuggestedMeal] = []

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func fetchSuggestions(profile: UserProfileDTO, date: String) async throws {
        isLoading = true
        defer { isLoading = false }

        let response: MealSuggestionResponse = try await api.request(
            MealAPI.suggest(profile: profile, date: date)
        )
        suggestions = response.suggestions
    }

    public func analyzePhoto(imageData: Data) async throws -> [SuggestedMeal] {
        isLoading = true
        defer { isLoading = false }

        let response: PhotoAnalysisResponse = try await api.upload(
            MealAPI.analyzePhoto,
            imageData: imageData
        )
        return response.meals
    }

    public func analyzeReceipt(imageData: Data) async throws -> [SuggestedMeal] {
        isLoading = true
        defer { isLoading = false }

        let response: PhotoAnalysisResponse = try await api.upload(
            MealAPI.analyzeReceipt,
            imageData: imageData
        )
        return response.meals
    }

    public func analyzeMenu(imageData: Data) async throws -> [SuggestedMeal] {
        isLoading = true
        defer { isLoading = false }

        let response: PhotoAnalysisResponse = try await api.upload(
            MealAPI.analyzeMenu,
            imageData: imageData
        )
        return response.meals
    }

    public func lookupNutrition(query: String) async throws -> NutritionLookupResponse {
        isLoading = true
        defer { isLoading = false }

        return try await api.request(MealAPI.lookupNutritionWeb(query: query))
    }

    public func parseRecipeUrl(_ url: String) async throws -> RecipeParseResponse {
        isLoading = true
        defer { isLoading = false }

        return try await api.request(MealAPI.parseRecipeUrl(url: url))
    }

    public func saveMeal(_ meal: MealEntry, context: ModelContext) {
        context.insert(meal)
        try? context.save()
    }

    public func deleteMeal(_ meal: MealEntry, context: ModelContext) {
        context.delete(meal)
        try? context.save()
    }

    public func mealsForDate(_ date: String, context: ModelContext) -> [MealEntry] {
        let descriptor = FetchDescriptor<MealEntry>(
            predicate: #Predicate { $0.date == date },
            sortBy: [SortDescriptor(\.loggedAt)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    public func todaysMacros(context: ModelContext) -> Macros {
        let today = DateHelpers.todayString()
        let meals = mealsForDate(today, context: context)
        return meals.reduce(.zero) { $0.adding($1.macros) }
    }
}
