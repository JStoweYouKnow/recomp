import SwiftUI
import SwiftData
import RefactorKit

struct MetabolicModelDashboardCard: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Query(sort: \MealEntry.date, order: .reverse) private var meals: [MealEntry]
    @Query(sort: \WearableDaySummary.date, order: .reverse) private var wearables: [WearableDaySummary]
    @Query(sort: \MetabolicModel.lastUpdated, order: .reverse) private var metabolicModels: [MetabolicModel]
    @Environment(AuthService.self) private var auth

    @State private var vm = MetabolicModelDashboardViewModel()
    @State private var showExplainer = false
    @AppStorage("aiCoachConsentGiven") private var aiConsentGiven = false
    @State private var showAIConsent = false

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                Text("Adaptive TDEE")
                    .font(.subheadline.weight(.semibold))

                if let resultSummary = vm.resultSummary {
                    Text(resultSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Log meals and weight for 7+ days to learn your true metabolism.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let errorText = vm.errorText {
                    Text(errorText)
                        .font(.caption2)
                        .foregroundStyle(Color.appError)
                }
                #if DEBUG
                if let unitDebugSummary = vm.unitDebugSummary {
                    Text(unitDebugSummary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                #endif

                DisclosureGroup(isExpanded: $showExplainer) {
                    Text(
                        "Adaptive TDEE learns your actual burn from intake vs. weight change, " +
                            "instead of using only height, weight, and a generic activity multiplier."
                    )
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                } label: {
                    Text("How it works")
                        .font(.caption)
                }

                Button {
                    if aiConsentGiven {
                        Task { await refreshModel() }
                    } else {
                        showAIConsent = true
                    }
                } label: {
                    if vm.isUpdating {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text(vm.resultSummary == nil ? "Update model" : "Refresh model")
                            .font(.caption.weight(.semibold))
                    }
                }
                .buttonStyle(.bordered)
                .disabled(vm.isUpdating)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .onAppear { vm.syncSummaryFromStores(metabolicModels: metabolicModels) }
        .onChange(of: metabolicModels.count) { _, _ in vm.syncSummaryFromStores(metabolicModels: metabolicModels) }
        .onChange(of: metabolicModels.first?.estimatedTDEE ?? 0) { _, _ in vm.syncSummaryFromStores(metabolicModels: metabolicModels) }
        .sheet(isPresented: $showAIConsent) {
            AIConsentView(
                onAccept: {
                    aiConsentGiven = true
                    showAIConsent = false
                    Task { await refreshModel() }
                },
                onDecline: { showAIConsent = false }
            )
        }
    }

    private func refreshModel() async {
        await vm.refreshModel(
            context: context,
            meals: meals,
            wearables: wearables,
            profileWeight: auth.currentUser?.weight,
            syncEngine: syncEngine
        )
    }
}

struct CoachCheckInDashboardCard: View {
    @Environment(\.modelContext) private var context
    @Environment(AuthService.self) private var auth

    @Query(sort: \BiofeedbackEntry.time, order: .reverse) private var biofeedbackEntries: [BiofeedbackEntry]
    @Query(sort: \MealEntry.date, order: .reverse) private var allMeals: [MealEntry]

    @State private var vm = CoachCheckInViewModel()
    @AppStorage("aiCoachConsentGiven") private var aiConsentGiven = false
    @State private var showAIConsent = false

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 8) {
                Text("Ref Check-In")
                    .font(.subheadline.weight(.semibold))

                if vm.loading {
                    ProgressView()
                        .controlSize(.small)
                } else if let message = vm.message {
                    Text(message)
                        .font(.caption)
                    if let tone = vm.tone {
                        Text(tone.capitalized)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("Get a personalized nudge based on today’s meals, biofeedback, streak, and workout.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Button("Get check-in") {
                    if aiConsentGiven {
                        Task { await fetchCheckIn() }
                    } else {
                        showAIConsent = true
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(vm.loading || auth.currentUser == nil)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .sheet(isPresented: $showAIConsent) {
            AIConsentView(
                onAccept: {
                    aiConsentGiven = true
                    showAIConsent = false
                    Task { await fetchCheckIn() }
                },
                onDecline: { showAIConsent = false }
            )
        }
    }

    private func fetchCheckIn() async {
        guard let profile = auth.currentUser else { return }
        await vm.fetchCheckIn(
            profileName: profile.name,
            context: context,
            biofeedbackEntries: biofeedbackEntries,
            allMeals: allMeals
        )
    }
}
