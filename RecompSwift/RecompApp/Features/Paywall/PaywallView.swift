import SwiftUI
import StoreKit
import RefactorKit

struct PaywallView: View {
    @Environment(SubscriptionService.self) private var subscriptions
    @Environment(\.dismiss) private var dismiss

    @State private var selectedProductID: String = SubscriptionService.annualID
    @State private var errorMessage: String?
    @State private var showError = false

    private var annualProduct: Product? {
        subscriptions.products.first { $0.id == SubscriptionService.annualID }
    }

    private var monthlyProduct: Product? {
        subscriptions.products.first { $0.id == SubscriptionService.monthlyID }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                headerSection
                featuresSection
                planPickerSection
                ctaSection
                footerLinks
            }
        }
        .background(Color.recompBackground)
        .alert("Purchase Error", isPresented: $showError, presenting: errorMessage) { _ in
            Button("OK", role: .cancel) {}
        } message: { msg in
            Text(msg)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 44))
                .foregroundStyle(
                    LinearGradient(colors: [.appSage, .appAccent], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                .padding(.top, 40)

            Text("Refactor Pro")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(.primary)

            Text("AI coaching that actually adapts to you")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .padding(.bottom, 28)
    }

    // MARK: - Features

    private var featuresSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            FeatureRow(icon: "brain.head.profile", title: "Ref AI Coach", subtitle: "Unlimited chat — log meals, swap exercises, get plan changes instantly")
            FeatureRow(icon: "chart.line.uptrend.xyaxis", title: "Adaptive Macro Engine", subtitle: "Weekly calorie & macro recalibration based on real results")
            FeatureRow(icon: "figure.strengthtraining.traditional", title: "AI Workout Plans", subtitle: "Personalised progressive programs, auto-adjusted for recovery")
            FeatureRow(icon: "waveform.path.ecg", title: "Biofeedback Insights", subtitle: "HRV, sleep, and stress data turned into daily action")
            FeatureRow(icon: "apple.watch", title: "Wearable Sync", subtitle: "Oura, Apple Watch, Garmin, Fitbit — all in one place")
            FeatureRow(icon: "person.3.fill", title: "Groups & Challenges", subtitle: "Compete with friends, join leaderboards, win")
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 28)
    }

    // MARK: - Plan Picker

    private var planPickerSection: some View {
        VStack(spacing: 12) {
            if let annual = annualProduct {
                PlanCard(
                    product: annual,
                    badge: "Best Value — Save 44%",
                    isSelected: selectedProductID == annual.id
                ) {
                    selectedProductID = annual.id
                }
            }

            if let monthly = monthlyProduct {
                PlanCard(
                    product: monthly,
                    badge: nil,
                    isSelected: selectedProductID == monthly.id
                ) {
                    selectedProductID = monthly.id
                }
            }

            if subscriptions.products.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding()
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 20)
    }

    // MARK: - CTA

    private var ctaSection: some View {
        VStack(spacing: 10) {
            Button {
                Task { await startPurchase() }
            } label: {
                Group {
                    if subscriptions.isPurchasing {
                        ProgressView().tint(.white)
                    } else {
                        Text("Start 7-Day Free Trial")
                            .font(.headline)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(
                    LinearGradient(colors: [.appSage, .appAccent], startPoint: .leading, endPoint: .trailing)
                )
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(subscriptions.isPurchasing || subscriptions.products.isEmpty)

            Text("Then \(selectedPriceDescription) — cancel anytime")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
    }

    // MARK: - Footer

    private var footerLinks: some View {
        HStack(spacing: 20) {
            Button("Restore") {
                Task { await subscriptions.restorePurchases() }
            }
            Text("·")
            Link("Privacy Policy", destination: URL(string: "https://getrefactor.app/privacy")!)
            Text("·")
            Link("Terms", destination: URL(string: "https://getrefactor.app/terms")!)
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .padding(.bottom, 40)
    }

    // MARK: - Helpers

    private var selectedPriceDescription: String {
        let product = subscriptions.products.first { $0.id == selectedProductID }
        return product?.displayPrice ?? "—"
    }

    private func startPurchase() async {
        guard let product = subscriptions.products.first(where: { $0.id == selectedProductID }) else { return }
        do {
            let purchased = try await subscriptions.purchase(product)
            if purchased { dismiss() }
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}

// MARK: - Sub-views

private struct FeatureRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.appAccent)
                .frame(width: 26)

            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

private struct PlanCard: View {
    let product: Product
    let badge: String?
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    if let badge {
                        Text(badge)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.appAccent)
                    }
                    Text(product.displayName)
                        .font(.subheadline.weight(.semibold))
                    Text(trialLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(product.displayPrice)
                    .font(.headline.weight(.bold))
            }
            .padding(16)
            .background(Color.recompSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(isSelected ? Color.appAccent : Color.recompBorder, lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var trialLabel: String {
        guard let intro = product.subscription?.introductoryOffer else {
            return "Then \(product.displayPrice)"
        }
        return "7-day free trial, then \(product.displayPrice)"
        // ^ intro offer localisation; for production use intro.period.localizedDescription
    }
}
