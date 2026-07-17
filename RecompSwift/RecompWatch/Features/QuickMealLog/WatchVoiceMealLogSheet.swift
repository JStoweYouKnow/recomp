import SwiftUI
import SwiftData
import RefactorKit

struct WatchVoiceMealLogSheet: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Binding var isPresented: Bool

    @State private var transcript = ""
    @FocusState private var transcriptFocused: Bool
    @State private var mealService = MealService()
    @State private var parsedMeals: [SuggestedMeal] = []
    @State private var parseError: String?
    @State private var statusMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Tap the text field, then the microphone to dictate. Tap Parse to send the text to your coach API for macros.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if let parseError {
                        Text(parseError)
                            .font(.caption2)
                            .foregroundStyle(.red)
                    }

                    if let statusMessage {
                        Text(statusMessage)
                            .font(.caption2)
                            .foregroundStyle(.green)
                    }

                    TextField("e.g. 200 g chicken and rice", text: $transcript, axis: .vertical)
                        .lineLimit(3, reservesSpace: true)
                        .textInputAutocapitalization(.sentences)
                        .focused($transcriptFocused)

                    Button("Parse meal") {
                        Task { await runParse() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(
                        transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || mealService.isLoading
                    )

                    if mealService.isLoading {
                        HStack(spacing: 6) {
                            ProgressView()
                                .scaleEffect(0.75)
                            Text("Parsing…")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if !parsedMeals.isEmpty {
                        Text("Tap a row to log it")
                            .font(.caption2)
                            .foregroundStyle(.secondary)

                        ForEach(parsedMeals) { meal in
                            Button {
                                logSuggestedMeal(meal)
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(meal.name)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.primary)
                                    Text("\(meal.macros.calories) cal · P\(Int(meal.macros.protein)) C\(Int(meal.macros.carbs)) F\(Int(meal.macros.fat))")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Voice Log")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        isPresented = false
                    }
                }
            }
            .onAppear {
                transcriptFocused = true
            }
        }
    }

    private func runParse() async {
        parseError = nil
        statusMessage = nil
        do {
            let meals = try await mealService.parseVoiceMeals(transcript: transcript)
            parsedMeals = meals
            if meals.isEmpty {
                parseError = "No meals returned. Try adding more detail (food names and amounts)."
            }
        } catch {
            parsedMeals = []
            parseError = error.localizedDescription
        }
    }

    private func logSuggestedMeal(_ suggestion: SuggestedMeal) {
        let mealType = suggestion.mealType.flatMap { MealType(rawValue: $0) } ?? .snack
        let meal = MealEntry(
            date: DateHelpers.todayString(),
            mealType: mealType,
            name: suggestion.name,
            macros: suggestion.macros
        )
        context.insert(meal)
        try? context.save()
        Task {
            await syncEngine?.markDirty()
            await syncEngine?.syncNow()
        }
        statusMessage = "Logged \(suggestion.name)"
        parsedMeals.removeAll { $0.name == suggestion.name && $0.macros.calories == suggestion.macros.calories }
    }
}
