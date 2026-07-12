import SwiftUI
import SwiftData
import RefactorKit

/// Saved recipe library + macro-fit suggestions (parity with web Ask Ref what to cook).
struct SavedRecipesView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @State private var mealService = MealService()
    @State private var planService = PlanService()
    @State private var recipes: [SavedRecipeRecord] = SavedRecipesStorage.load()
    @State private var urlInput = ""
    @State private var suggestions: [ScoredRecipeSuggestion] = []
    @State private var statusMessage: String?
    @State private var isBusy = false

    var body: some View {
        List {
            Section("Save from URL") {
                TextField("https://…", text: $urlInput)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                Button(isBusy ? "Saving…" : "Save recipe") {
                    Task { await saveURL() }
                }
                .disabled(isBusy || urlInput.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            Section {
                Button(isBusy ? "Ranking…" : "Ask Ref what to cook") {
                    Task { await fetchSuggestions() }
                }
                .disabled(isBusy)
            }

            if let statusMessage {
                Section {
                    Text(statusMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if !suggestions.isEmpty {
                Section("Top picks for today") {
                    ForEach(suggestions) { s in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(s.name).font(.headline)
                            Text("\(s.calories) cal · \(s.protein)g P · score \(s.fitScore)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(s.fitReason)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            if let link = s.recipeUrl, let u = URL(string: link) {
                                Link("Open recipe", destination: u)
                                    .font(.caption)
                            }
                        }
                    }
                }
            }

            Section("Library (\(recipes.count))") {
                if recipes.isEmpty {
                    Text("No saved recipes yet. Paste a URL above or sync from the web app.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(recipes) { r in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.name)
                            Text("\(r.calories) cal · \(r.protein)g P")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .onDelete(perform: deleteRecipes)
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompSaveRecipeURL)) { note in
            if let url = note.userInfo?["url"] as? String {
                urlInput = url
                Task { await saveURL() }
            } else if let pending = RecompAppGroupDefaults.shared.string(forKey: RecompUserDefaultsKeys.pendingRecipeSaveURL) {
                urlInput = pending
                RecompAppGroupDefaults.shared.removeObject(forKey: RecompUserDefaultsKeys.pendingRecipeSaveURL)
                Task { await saveURL() }
            }
        }
        .onAppear {
            recipes = SavedRecipesStorage.load()
            if urlInput.isEmpty,
               let pending = RecompAppGroupDefaults.shared.string(forKey: RecompUserDefaultsKeys.pendingRecipeSaveURL) {
                urlInput = pending
                RecompAppGroupDefaults.shared.removeObject(forKey: RecompUserDefaultsKeys.pendingRecipeSaveURL)
            }
        }
    }

    private func saveURL() async {
        let trimmed = urlInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isBusy = true
        statusMessage = nil
        defer { isBusy = false }
        do {
            let response = try await mealService.saveRecipeFromUrl(trimmed)
            let dto = response.recipe
            let record = SavedRecipeRecord(
                id: dto.id,
                name: dto.name,
                description: dto.description,
                calories: dto.calories,
                protein: dto.protein,
                carbs: dto.carbs,
                fat: dto.fat,
                recipeUrl: dto.recipeUrl,
                source: dto.source,
                mealTypes: dto.mealTypes,
                servings: dto.servings,
                addedAt: dto.addedAt
            )
            SavedRecipesStorage.append(record)
            recipes = SavedRecipesStorage.load()
            urlInput = ""
            statusMessage = "Saved \(record.name)"
            if let engine = syncEngine {
                await engine.scheduleSync()
            }
        } catch {
            statusMessage = "Could not save recipe"
        }
    }

    private func fetchSuggestions() async {
        isBusy = true
        statusMessage = nil
        defer { isBusy = false }
        let consumed = mealService.todaysMacros(context: context)
        let targets = planService.targets(for: Date(), context: context)
        let profile = (try? context.fetch(FetchDescriptor<UserProfile>()))?.first
        do {
            suggestions = try await mealService.suggestRecipes(
                payload: RecipeSuggestPayload(
                    macroTargets: targets,
                    todayMacros: consumed,
                    goal: profile?.goal.rawValue,
                    includeDiscover: true
                )
            )
            if suggestions.isEmpty {
                statusMessage = "No strong matches — save more recipes first."
            }
        } catch {
            statusMessage = "Could not load suggestions"
            suggestions = []
        }
    }

    private func deleteRecipes(at offsets: IndexSet) {
        var list = recipes
        list.remove(atOffsets: offsets)
        SavedRecipesStorage.save(list)
        recipes = list
        if let engine = syncEngine {
            Task { await engine.scheduleSync() }
        }
    }
}
