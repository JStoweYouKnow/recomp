import SwiftUI
import SwiftData
import Combine
import RefactorKit
import UIKit
import WatchConnectivity
import WidgetKit
import OSLog

// MARK: - App entry point

@main
struct RefactorApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var authService = AuthService()
    @State private var subscriptionService = SubscriptionService()
    @State private var coordinator = AppCoordinator()
    @State private var toastManager = ToastManager()

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
                    logger.fault("SwiftData in-memory fallback failed: \(error, privacy: .public). Using emergency empty store.")
                    let schema = Schema(RefactorSchema.models)
                    let container = try! ModelContainer(
                        for: schema,
                        configurations: [ModelConfiguration(isStoredInMemoryOnly: true)]
                    )
                    modelContainer = container
                    syncEngine = SyncEngine(modelContainer: container)
                    storeDegraded = true
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
                .environment(toastManager)
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
    /// Tab shell stays hidden until the first pull-merge sync completes so SwiftData
    /// @Query views are not observing the store while fetchAndApply bulk-deletes/reinserts rows.
    @State private var mainShellReady = false
    @State private var startupSyncTask: Task<Void, Never>?

    // MARK: Launch gate
    /// True until the landing screen has been dismissed. Only ever set once per process.
    @State private var isLaunching = true
    /// When the landing screen went up, so it can be held to a minimum on-screen time.
    @State private var launchedAt = Date.now
    /// Flips once `checkSession()` returns, so we can tell "signed out" from "not asked yet".
    @State private var didResolveSession = false

    private var preferredScheme: ColorScheme? {
        AppColorScheme(rawValue: colorSchemePref)?.colorScheme
    }

    var body: some View {
        ZStack {
            authenticatedContent

            // The splash sits *over* the content and fades away, rather than cross-fading
            // with it. Dissolving two full-screen layouts against each other showed both
            // wordmarks at once — a visible double exposure. Fading one layer out reveals
            // the finished screen underneath cleanly.
            //
            // It covers the whole cold-launch window: the session check (a network call,
            // during which `isAuthenticated` is still false) and the first sync. Without
            // it, a signed-in user saw the login screen flash before their data loaded.
            if isLaunching {
                LaunchAnimationView()
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .animation(.easeInOut(duration: 0.35), value: isLaunching)
        .task(id: launchGateToken) { await resolveLaunchIfReady() }
        .preferredColorScheme(preferredScheme)
        .modifier(RootFeedbackOverlay())
        .safeAreaInset(edge: .top) {
            if storeDegraded {
                StoreDegradedBanner()
            }
        }
        .task {
            subscriptions.start()
            auth.bind(modelContext: modelContext)
            await auth.checkSession()
            // Signals the launch gate that "signed out" is now a real answer rather than
            // just the pre-check default.
            didResolveSession = true
            if auth.isAuthenticated {
                PaywallTiming.recordSession()
                WearableMassStoredPoundsMigration.runOnceIfNeeded(
                    context: modelContext,
                    profileWeightLbs: auth.currentUser?.weight
                )
                if !auth.isDemo && !aiConsentGiven {
                    showAIConsentOnboarding = true
                }
                scheduleStartupSync()
            } else {
                mainShellReady = false
            }
        }
        .onChange(of: auth.isAuthenticated) { _, isAuthenticated in
            if isAuthenticated {
                subscriptions.proAccessOverride = auth.currentUser?.proAccess == true
                showPaywallIfNeeded()
                if !auth.isDemo && !aiConsentGiven {
                    showAIConsentOnboarding = true
                }
                scheduleStartupSync()
            } else {
                startupSyncTask?.cancel()
                mainShellReady = false
                // Sign-out: tell the paired watch to drop its cached session, and clear
                // paywall timing so the next account isn't judged by this one's history.
                PhoneSessionManager.shared.clearUserId()
                PaywallTiming.reset()
                WorkoutAnalyticsCache.reset()
            }
        }
        .onChange(of: subscriptions.status) { _, _ in
            showPaywallIfNeeded()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, mainShellReady, auth.isAuthenticated, let engine = syncEngine else { return }
            Task {
                try? await engine.fetchAndApply()
                if PendingIntentSync.consume() {
                    await engine.markDirty()
                    _ = await engine.syncNow()
                }
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
        .onReceive(NotificationCenter.default.publisher(for: .recompMealsDidChange)) { _ in
            pushWatchDashboard(from: modelContext)
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompPlanDidChange)) { _ in
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

    /// The paywall used to fire the moment `isAuthenticated` flipped — a purchase sheet
    /// before the user had a plan, a logged meal, or any reason to want one. It now waits
    /// for the aha moment (a generated plan) and for the user to have opened the app more
    /// than once, so the pitch lands against something they've actually seen work.
    @ViewBuilder
    private var authenticatedContent: some View {
        if auth.isAuthenticated {
            if mainShellReady {
                MainTabView()
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
                // Re-entry after sign-in mid-session: a second branded splash would be
                // odd here, so the shape-matching skeleton carries it instead.
                LaunchSkeletonView()
            }
        } else {
            OnboardingView()
        }
    }

    // MARK: - Launch gate

    /// Recomputed whenever something the gate depends on changes, so `task(id:)` re-runs.
    private var launchGateToken: String {
        "\(didResolveSession)-\(auth.isAuthenticated)-\(mainShellReady)"
    }

    /// The landing screen is done when the session is known, and — for a signed-in user —
    /// the first sync has mounted the shell. A signed-out user goes straight to onboarding.
    private var launchWorkComplete: Bool {
        guard didResolveSession else { return false }
        return auth.isAuthenticated ? mainShellReady : true
    }

    private func resolveLaunchIfReady() async {
        guard isLaunching, launchWorkComplete else { return }
        // Pads only a launch that finished early; never delays a slow one.
        await LaunchTiming.waitOutRemainder(since: launchedAt)
        guard !Task.isCancelled else { return }
        isLaunching = false
    }

    private func showPaywallIfNeeded() {
        guard auth.isAuthenticated, !auth.isDemo, subscriptions.status == .notPurchased else { return }
        guard PaywallTiming.shouldPresent(context: modelContext) else { return }
        showPaywall = true
        PaywallTiming.markPresented()
    }

    @MainActor
    private func scheduleStartupSync() {
        startupSyncTask?.cancel()
        startupSyncTask = Task { await prepareMainShellAndSync() }
    }

    /// Pull-merge **before** mounting tabs. Prior builds mounted MainTabView first; on
    /// TestFlight, fetchAndApply then deleted/reinserted meals, fasting sessions, etc. while
    /// dashboard @Query observers were live, which crashed SwiftData on iOS 26.
    @MainActor
    private func prepareMainShellAndSync() async {
        guard auth.isAuthenticated else {
            mainShellReady = false
            return
        }
        mainShellReady = false
        defer {
            if auth.isAuthenticated {
                mainShellReady = true
            }
        }

        guard !Task.isCancelled, let engine = syncEngine else { return }
        try? await engine.fetchAndApply()
        guard !Task.isCancelled, auth.isAuthenticated else { return }
        auth.refreshCurrentUserFromStore()
        subscriptions.proAccessOverride = auth.currentUser?.proAccess == true
        pushWatchDashboard(from: modelContext)
    }

    private func pushWatchDashboard(from context: ModelContext) {
        WatchDashboardSnapshotPublisher.publish(from: context)
        // Complications read this flattened snapshot rather than opening the SwiftData
        // store themselves, so it has to be republished alongside the watch payload.
        TodayWidgetSnapshotPublisher.publish(from: context)
        WidgetCenter.shared.reloadAllTimelines()
        PhoneSessionManager.shared.pushDataRefresh()
    }
}

/// Non-intrusive banner shown when the on-disk store failed to open and the app is
/// running on a temporary in-memory store (changes will not persist this launch).
/// Bundles the app-wide feedback surfaces (toast + confetti) and their notification
/// observers into one modifier so `RootView.body` stays small enough for the type-checker.
private struct RootFeedbackOverlay: ViewModifier {
    @Environment(ToastManager.self) private var toastManager
    @State private var showConfetti = false

    func body(content: Content) -> some View {
        content
            .toastOverlay()
            .overlay {
                if showConfetti {
                    ConfettiView()
                        .ignoresSafeArea()
                        .allowsHitTesting(false)
                        .transition(.opacity)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .recompShowToast)) { note in
                let message = note.userInfo?["message"] as? String ?? ""
                let type = note.userInfo?["type"] as? ToastType ?? .info
                guard !message.isEmpty else { return }
                toastManager.show(message, type: type)
            }
            .onReceive(NotificationCenter.default.publisher(for: .recompCelebrate)) { _ in
                Haptics.success()
                withAnimation(.easeIn(duration: 0.2)) { showConfetti = true }
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(2.2))
                    withAnimation(.easeOut(duration: 0.4)) { showConfetti = false }
                }
            }
    }
}

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

/// Toolbar entry point for the AI coach.
///
/// This used to be a 56pt circle floated over the whole authenticated app, which sat on
/// top of the last row of every list, covered the trailing swipe zone on meal rows, and
/// fought the rest-timer banner for the same corner mid-workout. As a toolbar item it
/// stays reachable on every screen without ever covering content.
struct CoachToolbarButton: View {
    @AppStorage("aiCoachConsentGiven") private var consentGiven = false
    @State private var showChat = false
    @State private var showConsent = false

    var body: some View {
        Button {
            if consentGiven {
                showChat = true
            } else {
                showConsent = true
            }
        } label: {
            Image(systemName: "bubble.left.and.text.bubble.right.fill")
                .foregroundStyle(Color.appAccent)
        }
        .accessibilityLabel("Ask the coach")
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

extension View {
    /// Adds the coach button to a screen's navigation bar. Apply inside the screen's
    /// `NavigationStack` so it lands in that screen's toolbar.
    func coachToolbarItem() -> some View {
        toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CoachToolbarButton()
            }
        }
    }
}
