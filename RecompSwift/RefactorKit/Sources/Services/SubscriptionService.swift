import Foundation
import StoreKit
import Observation

@MainActor
@Observable
public final class SubscriptionService {

    // MARK: - Product IDs

    public static let monthlyID = "com.recomp.ios.pro.monthly"
    public static let annualID  = "com.recomp.ios.pro.annual"

    // MARK: - State

    public enum Status: Equatable {
        case unknown
        case subscribed
        case notPurchased
    }

    public private(set) var status: Status = .unknown
    public private(set) var products: [Product] = []
    public private(set) var isPurchasing = false

    // Set by the app after auth so proAccess overrides can bypass StoreKit.
    public var proAccessOverride = false

    public var isPremium: Bool {
        proAccessOverride || status == .subscribed
    }

    // MARK: - Private

    private var transactionListenerTask: Task<Void, Never>?

    public init() {}

    // MARK: - Lifecycle

    public func start() {
        transactionListenerTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if case .verified(let tx) = result { await tx.finish() }
                await self.refreshStatus()
            }
        }
        Task { await loadProducts() }
        Task { await refreshStatus() }
    }

    public func stop() {
        transactionListenerTask?.cancel()
    }

    // MARK: - Purchase

    @discardableResult
    public func purchase(_ product: Product) async throws -> Bool {
        isPurchasing = true
        defer { isPurchasing = false }

        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            let transaction = try verification.payloadValue
            await transaction.finish()
            await refreshStatus()
            return true
        case .userCancelled, .pending:
            return false
        @unknown default:
            return false
        }
    }

    public func restorePurchases() async {
        try? await AppStore.sync()
        await refreshStatus()
    }

    // MARK: - Private helpers

    private func loadProducts() async {
        do {
            let loaded = try await Product.products(for: [Self.monthlyID, Self.annualID])
            // Show monthly before annual
            products = loaded.sorted { $0.id == Self.monthlyID && $1.id == Self.annualID }
        } catch {
            print("[SubscriptionService] Failed to load products: \(error)")
        }
    }

    private func refreshStatus() async {
        var hasActive = false

        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            guard transaction.productType == .autoRenewable else { continue }
            guard transaction.revocationDate == nil else { continue }
            hasActive = true
        }

        status = hasActive ? .subscribed : .notPurchased
    }
}
