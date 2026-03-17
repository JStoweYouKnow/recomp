import SwiftUI
import SwiftData

struct AdjustView: View {
    @Environment(\.modelContext) private var context
    @State private var planService = PlanService()
    @State private var researchService = ResearchService()

    @State private var feedback = ""
    @State private var suggestion: AdjustSuggestion?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    feedbackSection
                    if let suggestion { suggestionSection(suggestion) }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding()
            }
            .navigationTitle("Adjust Plan")
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
                            suggestion = try await planService.adjustPlan(
                                feedback: feedback,
                                currentPlan: nil
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
                        macroStat("Cal", value: "\(newTargets.calories)", color: .orange)
                        macroStat("P", value: "\(Int(newTargets.protein))g", color: .red)
                        macroStat("C", value: "\(Int(newTargets.carbs))g", color: .blue)
                        macroStat("F", value: "\(Int(newTargets.fat))g", color: .yellow)
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
                // Apply the suggestion to the current plan
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
