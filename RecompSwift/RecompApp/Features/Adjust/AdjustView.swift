import SwiftUI
import SwiftData
import RefactorKit

struct AdjustView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @State private var planService = PlanService()
    @State private var researchService = ResearchService()

    @State private var feedback = ""
    @State private var suggestion: AdjustSuggestion?
    @State private var errorMessage: String?
    @FocusState private var feedbackFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    feedbackSection
                    if let suggestion { suggestionSection(suggestion) }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(Color.appError)
                    }
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Adjust Plan")
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { feedbackFocused = false }
                }
            }
        }
    }

    private var feedbackSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How's your plan going?")
                .font(.headline)

            Text("Share your feedback and the AI will suggest adjustments to your macros and training.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            TextEditor(text: $feedback)
                .frame(minHeight: 120)
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(.secondary.opacity(0.3))
                )
                .focused($feedbackFocused)

            HStack {
                Button {
                    Task {
                        try? await researchService.search(query: "latest nutrition guidelines for \(planService.currentPlan(context: context)?.reasoning ?? "fitness")")
                        if let answer = researchService.result?.answer {
                            feedback += "\n\nLatest research: \(answer)"
                        }
                    }
                } label: {
                    Label("Add Latest Guidelines", systemImage: "globe")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .disabled(researchService.isSearching)

                Spacer()

                Button {
                    Task {
                        do {
                            let iso = ISO8601DateFormatter()
                            let planDTO = planService.currentPlan(context: context).map {
                                FitnessPlanDTO(from: $0, iso8601: iso)
                            }
                            suggestion = try await planService.adjustPlan(
                                feedback: feedback,
                                currentPlan: planDTO
                            )
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                    }
                } label: {
                    if planService.isAdjusting {
                        ProgressView()
                    } else {
                        Label("Adjust", systemImage: "sparkles")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(feedback.isEmpty || planService.isAdjusting)
            }
        }
    }

    private func suggestionSection(_ suggestion: AdjustSuggestion) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()

            Text("Suggestion")
                .font(.headline)

            Text(suggestion.explanation)
                .font(.body)

            if let newTargets = suggestion.newTargets {
                GroupBox("New Macro Targets") {
                    HStack(spacing: 16) {
                        macroStat("Cal", value: "\(newTargets.calories)", color: .appWarm)
                        macroStat("P", value: "\(Int(newTargets.protein))g", color: .appAccent)
                        macroStat("C", value: "\(Int(newTargets.carbs))g", color: .appSage)
                        macroStat("F", value: "\(Int(newTargets.fat))g", color: .appTerracotta)
                    }
                }
            }

            if let changes = suggestion.changes, !changes.isEmpty {
                GroupBox("Changes") {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(changes, id: \.self) { change in
                            Label(change, systemImage: "arrow.right.circle")
                                .font(.subheadline)
                        }
                    }
                }
            }

            Button {
                guard let plan = planService.currentPlan(context: context) else { return }
                planService.applyAdjustSuggestion(suggestion, to: plan)
                RecompAppGroupDefaults.shared.set(true, forKey: RecompUserDefaultsKeys.hasAdjustedPlan)
                do {
                    try context.save()
                    Task { await syncEngine?.markDirty() }
                } catch {
                    errorMessage = error.localizedDescription
                }
            } label: {
                Text("Apply Changes")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private func macroStat(_ label: String, value: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline)
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
