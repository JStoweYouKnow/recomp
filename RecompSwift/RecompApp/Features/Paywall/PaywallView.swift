import SwiftUI
import StoreKit
import RefactorKit

struct PaywallView: View {
    @Environment(SubscriptionService.self) private var subscriptions
    @Environment(\.dismiss) private var dismiss

    @State private var selectedProductID: String = SubscriptionService.annualID
    @State private var errorMessage: String?
    @State private var showError = false
    @State private var productsTimedOut = false

    private var annualProduct: Product? {
        subscriptions.products.first { $0.id == SubscriptionService.annualID }
    }

    private var monthlyProduct: Product? {
        subscriptions.products.first { $0.id == SubscriptionService.monthlyID }
    }

    var body: some View {
        NavigationStack {
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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .font(.title3)
                    }
                    .accessibilityLabel("Close")
                }
            }
            .alert("Purchase Error", isPresented: $showError, presenting: errorMessage) { _ in
                Button("OK", role: .cancel) {}
            } message: { msg in
                Text(msg)
            }
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
                .accessibilityHidden(true)

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
            Text("What Pro adds")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.5)

            FeatureRow(icon: "brain.head.profile", title: "Ref AI Coach", subtitle: "Unlimited chat — log meals, swap exercises, get plan changes instantly")
            FeatureRow(icon: "chart.line.uptrend.xyaxis", title: "Adaptive Macro Engine", subtitle: "Weekly calorie & macro recalibration based on real results")
            FeatureRow(icon: "figure.strengthtraining.traditional", title: "AI Workout Plans", subtitle: "Personalised progressive programs, auto-adjusted for recovery")
            FeatureRow(icon: "waveform.path.ecg", title: "Biofeedback Insights", subtitle: "HRV, sleep, and stress data turned into daily action")
            FeatureRow(icon: "apple.watch", title: "Wearable Sync", subtitle: "Oura, Apple Watch, Garmin, Fitbit — all in one place")
            FeatureRow(icon: "person.3.fill", title: "Groups & Challenges", subtitle: "Compete with friends, join leaderboards, win")

            // Without this, the list above is a set of claims with nothing to weigh them
            // against — the reader can't tell what they'd actually be giving up.
            freeTierNote
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 28)
    }

    private var freeTierNote: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark.circle")
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("Free keeps manual meal and workout logging, your history, and Apple Health sync — forever.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 4)
        .accessibilityElement(children: .combine)
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
                if productsTimedOut {
                    VStack(spacing: 8) {
                        Text("Could not load pricing")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        if let err = subscriptions.loadError {
                            Text(err)
                                .font(.caption2)
                                .foregroundStyle(Color.appError)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                        Button("Retry") {
                            productsTimedOut = false
                            subscriptions.start()
                            scheduleProductTimeout()
                        }
                        .font(.subheadline)
                        .tint(Color.appAccent)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                        .onAppear { scheduleProductTimeout() }
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 20)
    }

    // MARK: - CTA

    private var ctaSection: some View {
        VStack(spacing: 10) {
            // Billed amount is the most prominent pricing element per App Store guideline 3.1.2(c)
            if let product = selectedProduct {
                VStack(spacing: 3) {
                    Text("\(product.displayPrice)\(periodSuffix(for: product))")
                        .font(.title3.weight(.bold))
                    if selectedProductHasTrial {
                        Text("After \(selectedTrialPeriodLabel) free trial")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Button {
                Task { await startPurchase() }
            } label: {
                Group {
                    if subscriptions.isPurchasing {
                        ProgressView().tint(.white)
                    } else {
                        Text(ctaButtonLabel)
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

            Text("Renews automatically · Cancel anytime")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
    }

    // MARK: - Footer

    private var footerLinks: some View {
        HStack(spacing: 16) {
            Button("Restore Purchases") {
                Task { await subscriptions.restorePurchases() }
            }
            Text("·")
            Link("Privacy Policy", destination: URL(string: "https://refactoryourbody.com/privacy")!)
            Text("·")
            Link("Terms of Use", destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 24)
        .padding(.bottom, 40)
    }

    // MARK: - Helpers

    private var selectedProduct: Product? {
        subscriptions.products.first { $0.id == selectedProductID }
    }

    private var selectedProductHasTrial: Bool {
        selectedProduct?.subscription?.introductoryOffer?.paymentMode == .freeTrial
    }

    private var selectedTrialPeriodLabel: String {
        guard let intro = selectedProduct?.subscription?.introductoryOffer,
              intro.paymentMode == .freeTrial else { return "7-day" }
        let p = intro.period
        return "\(p.value)-\(periodUnitLabel(p.unit))"
    }

    private var ctaButtonLabel: String {
        guard selectedProductHasTrial else { return "Subscribe Now" }
        let capitalised = selectedTrialPeriodLabel
            .prefix(1).uppercased() + selectedTrialPeriodLabel.dropFirst()
        return "Start \(capitalised) Free Trial"
    }

    private func periodSuffix(for product: Product) -> String {
        guard let sub = product.subscription else { return "" }
        switch sub.subscriptionPeriod.unit {
        case .year: return "/yr"
        case .month: return "/mo"
        case .week: return "/wk"
        case .day: return "/day"
        @unknown default: return ""
        }
    }

    private func periodUnitLabel(_ unit: Product.SubscriptionPeriod.Unit) -> String {
        switch unit {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        @unknown default: return "period"
        }
    }

    private func scheduleProductTimeout() {
        Task {
            try? await Task.sleep(for: .seconds(8))
            if subscriptions.products.isEmpty {
                productsTimedOut = true
            }
        }
    }

    private func startPurchase() async {
        guard let product = subscriptions.products.first(where: { $0.id == selectedProductID }) else {
            errorMessage = "Products are still loading. Please wait a moment and try again."
            showError = true
            return
        }
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
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct PlanCard: View {
    let product: Product
    let badge: String?
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    if let badge {
                        Text(badge)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.appAccent)
                    }
                    Text(product.displayName)
                        .font(.subheadline.weight(.semibold))
                    Text(subscriptionLengthLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let trial = trialInfoText {
                        Text(trial)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(product.displayPrice)
                        .font(.headline.weight(.bold))
                    Text(periodSuffix)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
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
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var subscriptionLengthLabel: String {
        guard let sub = product.subscription else { return "" }
        let p = sub.subscriptionPeriod
        switch p.unit {
        case .day:   return p.value == 1 ? "1-day subscription"    : "\(p.value)-day subscription"
        case .week:  return p.value == 1 ? "Weekly subscription"   : "\(p.value)-week subscription"
        case .month: return p.value == 1 ? "Monthly subscription"  : "\(p.value)-month subscription"
        case .year:  return p.value == 1 ? "Annual subscription (1 year)" : "\(p.value)-year subscription"
        @unknown default: return ""
        }
    }

    private var periodSuffix: String {
        guard let sub = product.subscription else { return "" }
        switch sub.subscriptionPeriod.unit {
        case .year:  return "/year"
        case .month: return "/month"
        case .week:  return "/week"
        case .day:   return "/day"
        @unknown default: return ""
        }
    }

    private var trialInfoText: String? {
        guard let intro = product.subscription?.introductoryOffer,
              intro.paymentMode == .freeTrial else { return nil }
        let p = intro.period
        return "\(p.value)-\(unitLabel(p.unit)) free trial included"
    }

    private func unitLabel(_ unit: Product.SubscriptionPeriod.Unit) -> String {
        switch unit {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        @unknown default: return "period"
        }
    }
}
