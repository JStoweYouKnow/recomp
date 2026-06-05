import Foundation
import RefactorKit

/// Owns the networking / AI-analysis orchestration for `AddMealSheet`, keeping the
/// view focused on form bindings. Loading flags, results, and per-mode error strings
/// live here; form fields (name/macros) stay in the view since they drive `TextField`s,
/// so the field-populating methods return their results for the view to apply.
@MainActor
@Observable
final class AddMealViewModel {
    private let mealService = MealService()

    var analysisResults: [SuggestedMeal] = []
    var isAnalyzing = false

    var voiceParseError: String?
    var recipeParseError: String?
    var foodSearchError: String?
    var suggestError: String?
    var menuScanError: String?
    var receiptScanError: String?

    func analyzePhoto(data: Data) async {
        isAnalyzing = true
        do {
            analysisResults = try await mealService.analyzePhoto(imageData: data)
        } catch {
            analysisResults = []
        }
        isAnalyzing = false
    }

    func analyzeMenu(data: Data) async {
        isAnalyzing = true
        do {
            analysisResults = try await mealService.analyzeMenu(imageData: data)
        } catch {
            analysisResults = []
            menuScanError = error.localizedDescription
        }
        isAnalyzing = false
    }

    func analyzeReceipt(data: Data) async {
        isAnalyzing = true
        do {
            analysisResults = try await mealService.analyzeReceipt(imageData: data)
        } catch {
            analysisResults = []
            receiptScanError = error.localizedDescription
        }
        isAnalyzing = false
    }

    /// Returns the looked-up nutrition so the view can populate its macro fields; `nil` on error.
    func lookupNutrition(query: String) async -> NutritionLookupResponse? {
        isAnalyzing = true
        defer { isAnalyzing = false }
        do {
            return try await mealService.lookupNutrition(query: query)
        } catch {
            foodSearchError = error.localizedDescription
            return nil
        }
    }

    /// Returns the parsed recipe so the view can populate its macro fields; `nil` on error.
    func parseRecipe(url: String) async -> RecipeParseResponse? {
        isAnalyzing = true
        recipeParseError = nil
        defer { isAnalyzing = false }
        do {
            return try await mealService.parseRecipeUrl(url)
        } catch {
            recipeParseError = error.localizedDescription
            return nil
        }
    }

    func parseVoiceTranscript(_ transcript: String) async {
        voiceParseError = nil
        isAnalyzing = true
        defer { isAnalyzing = false }
        do {
            let meals = try await mealService.parseVoiceMeals(transcript: transcript)
            analysisResults = meals
            if meals.isEmpty {
                voiceParseError = "No meals returned. Try adding more detail (food names and amounts)."
            }
        } catch {
            analysisResults = []
            voiceParseError = error.localizedDescription
        }
    }

    func fetchSuggestions(profile: UserProfileDTO, date: String) async {
        isAnalyzing = true
        do {
            try await mealService.fetchSuggestions(profile: profile, date: date)
            analysisResults = mealService.suggestions
        } catch {
            suggestError = error.localizedDescription
        }
        isAnalyzing = false
    }
}
