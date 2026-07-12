import SwiftUI
import SwiftData
import Combine
import RefactorKit
import UIKit
import WatchConnectivity
import OSLog

// MARK: - App entry point

@main
struct RefactorApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var authService = AuthService()
    @State private var subscriptionService = SubscriptionService()
    @State private var coordinator = AppCoordinator()

    private let modelContainer: ModelContainer
    private let syncEngine: SyncEngine
    /// True when the on-disk store could not be opened and we fell back to a
    /// temporary in-memory store. Surfaced to the user so changes-won't-persist
    /// is never silent (previously this was only a `print`).
    private let storeDegraded: Bool

    init() {
        PhoneSessionManager.shared.activate()
        let logger = Logger(subsystem: "com.refactor.ios", category: "SwiftData")
        do {
            let container = try RefactorSchema.makeContainer(
                appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier
            )
            modelContainer = container
            syncEngine = SyncEngine(modelContainer: container)
            storeDegraded = false
        } catch {
            // On-disk store failed to open (corruption or unmigrateable schema change).
            // Attempt recovery: delete the corrupt store and recreate it. All data
            // re-syncs from the server, so this is safe for a sync-first app.
            logger.error("On-disk SwiftData store failed to open: \(error, privacy: .public). Attempting recovery.")
            RefactorSchema.deleteStore(appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier)
            do {
                let container = try RefactorSchema.makeContainer(
                    appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier
                )
                modelContainer = container
                syncEngine = SyncEngine(modelContainer: container)
                storeDegraded = false
                logger.info("SwiftData store recovered — data will re-sync from server.")
            } catch {
                // Recovery also failed (e.g. permissions issue). Fall back to memory store
                // and surface the banner so the user knows changes won't persist.
                logger.error("SwiftData recovery failed: \(error, privacy: .public). Falling back to a temporary in-memory store.")
                do {
                    let container = try RefactorSchema.makeContainer(inMemory: true)
                    modelContainer = container
                    syncEngine = SyncEngine(modelContainer: container)
                    storeDegraded = true
                } catch {
                    fatalError("SwiftData could not start: \(error)")
                }
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView(storeDegraded: storeDegraded)
                .environment(authService)
                .environment(subscriptionService)
                .environment(coordinator)
                .environment(\.syncEngine, syncEngine)
        }
        .modelContainer(modelContainer)
    }
}

// MARK: - Appearance

enum AppColorScheme: String, CaseIterable {
    case system = "System"
    case light  = "Light"
    case dark   = "Dark"

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }
}

// MARK: - Root view

struct RootView: View {
    @Environment(AuthService.self) private var auth
    @Environment(SubscriptionService.self) private var subscriptions
    @Environment(AppCoordinator.self) private var coordinator
    @Environment(\.syncEngine) private var syncEngine
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.modelContext) private var modelContext

    /// Passed from the app entry point; true when running on a temporary store.
    var storeDegraded: Bool = false

    @AppStorage("appColorScheme") private var colorSchemePref: String = AppColorScheme.system.rawValue
    @AppStorage("aiCoachConsentGiven") private var aiConsentGiven = false

    @State private var showPaywall = false
    @State private var showAIConsentOnboarding = false

    private var preferredScheme: ColorScheme? {
        AppColorScheme(rawValue: colorSchemePref)?.colorScheme
    }

    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainTabView()
                    .overlay(alignment: .bottomTrailing) {
                        CoachFloatingButton()
                    }
                    .sheet(isPresented: $showAIConsentOnboarding) {
                        AIConsentView(
                            onAccept: {
                                aiConsentGiven = true
                                showAIConsentOnboarding = false
                            },
                            onDecline: { showAIConsentOnboarding = false }
                        )
                    }
                    .sheet(isPresented: $showPaywall) {
                        PaywallView()
                    }
            } else {
                OnboardingView()
            }
        }
        .preferredColorScheme(preferredScheme)
        .safeAreaInset(edge: .top) {
            if storeDegraded {
                StoreDegradedBanner()
            }
        }
        .task {
            subscriptions.start()
            auth.bind(modelContext: modelContext)
            await auth.checkSession()
            if auth.isAuthenticated {
                WearableMassStoredPoundsMigration.runOnceIfNeeded(
                    context: modelContext,
                    profileWeightLbs: auth.currentUser?.weight
                )
                if !auth.isDemo && !aiConsentGiven {
                    showAIConsentOnboarding = true
                }
            }
            if auth.isAuthenticated, let engine = syncEngine {
                try? await engine.fetchAndApply()
                auth.refreshCurrentUserFromStore()
                subscriptions.proAccessOverride = auth.currentUser?.proAccess == true
                pushWatchDashboard(from: modelContext)
            }
        }
        .onChange(of: auth.isAuthenticated) { _, isAuthenticated in
            if isAuthenticated {
                subscriptions.proAccessOverride = auth.currentUser?.proAccess == true
                showPaywallIfNeeded()
                if !auth.isDemo && !aiConsentGiven {
                    showAIConsentOnboarding = true
                }
            } else {
                // Sign-out: tell the paired watch to drop its cached session.
                PhoneSessionManager.shared.clearUserId()
            }
        }
        .onChange(of: subscriptions.status) { _, _ in
            showPaywallIfNeeded()
        }
        .onChange(of: auth.isAuthenticated) { _, isAuthenticated in
            guard isAuthenticated, let engine = syncEngine else { return }
            Task {
                try? await engine.fetchAndApply()
                auth.refreshCurrentUserFromStore()
                subscriptions.proAccessOverride = auth.currentUser?.proAccess == true
                pushWatchDashboard(from: modelContext)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, auth.isAuthenticated, let engine = syncEngine else { return }
            Task {
                try? await engine.fetchAndApply()
                auth.refreshCurrentUserFromStore()
                pushWatchDashboard(from: modelContext)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompScheduleDataSync)) { _ in
            guard let engine = syncEngine else { return }
            Task { await engine.scheduleFetchAndApply() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompSchedulePushSync)) { _ in
            guard let engine = syncEngine else { return }
            Task { await engine.scheduleSync() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompPhoneDidSync)) { _ in
            pushWatchDashboard(from: modelContext)
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompNavigateToMeals)) { _ in
            coordinator.navigate(to: .meals)
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompNavigateToWorkouts)) { _ in
            coordinator.navigate(to: .workouts)
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompNavigateToDashboard)) { _ in
            coordinator.navigate(to: .dashboard)
        }
        .onOpenURL { url in
            handleIncomingURL(url)
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompSaveRecipeURL)) { _ in
            coordinator.navigate(to: .meals)
        }
    }

    private func handleIncomingURL(_ url: URL) {
        var recipeURL: String?
        if url.scheme == "https" || url.scheme == "http" {
            recipeURL = url.absoluteString
        } else if url.scheme == "refactor", url.host == "save-recipe" {
            recipeURL = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "url" })?
                .value
        }
        guard let recipeURL, !recipeURL.isEmpty else { return }
        RecompAppGroupDefaults.shared.set(recipeURL, forKey: RecompUserDefaultsKeys.pendingRecipeSaveURL)
        NotificationCenter.default.post(
            name: .recompSaveRecipeURL,
            object: nil,
            userInfo: ["url": recipeURL]
        )
        coordinator.navigate(to: .meals)
    }

    private func showPaywallIfNeeded() {
        guard auth.isAuthenticated, !auth.isDemo, subscriptions.status == .notPurchased else { return }
        showPaywall = true
    }

    private func pushWatchDashboard(from context: ModelContext) {
        WatchDashboardSnapshotPublisher.publish(from: context)
        PhoneSessionManager.shared.pushDataRefresh()
    }
}

/// Non-intrusive banner shown when the on-disk store failed to open and the app is
/// running on a temporary in-memory store (changes will not persist this launch).
struct StoreDegradedBanner: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
            Text("Temporary storage — changes may not be saved. Restart the app; your data will re-sync.")
                .font(.footnote)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.appError, in: RoundedRectangle(cornerRadius: 0))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Warning: running on temporary storage. Changes may not be saved. Restart the app; your data will re-sync.")
    }
}

struct CoachFloatingButton: View {
    @AppStorage("aiCoachConsentGiven") private var consentGiven = false
    @State private var showChat = false
    @State private var showConsent = false
    @State private var keyboardVisible = false

    var body: some View {
        Button {
            if consentGiven {
                showChat = true
            } else {
                showConsent = true
            }
        } label: {
            Image(systemName: "bubble.left.and.text.bubble.right.fill")
                .font(.title2)
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(
                    LinearGradient(
                        colors: [Color.appSage, Color.appAccent],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.25), radius: 8, y: 4)
        }
        .padding(.trailing, 16)
        .padding(.bottom, 90)
        .opacity(keyboardVisible ? 0 : 1)
        .allowsHitTesting(!keyboardVisible)
        .animation(.easeInOut(duration: 0.2), value: keyboardVisible)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
        .sheet(isPresented: $showChat) {
            CoachChatView()
        }
        .sheet(isPresented: $showConsent) {
            AIConsentView(
                onAccept: {
                    consentGiven = true
                    showConsent = false
                    showChat = true
                },
                onDecline: {
                    showConsent = false
                }
            )
        }
    }
}
