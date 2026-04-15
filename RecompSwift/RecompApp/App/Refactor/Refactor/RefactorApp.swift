import SwiftUI
import SwiftData
import Combine
import RefactorKit
import UIKit

// MARK: - App entry point

@main
struct RefactorApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var authService = AuthService()
    @State private var coordinator = AppCoordinator()

    private let modelContainer: ModelContainer
    private let syncEngine: SyncEngine

    init() {
        do {
            let container = try RefactorSchema.makeContainer(
                appGroupIdentifier: RefactorSchema.sharedAppGroupIdentifier
            )
            modelContainer = container
            syncEngine = SyncEngine(modelContainer: container)
        } catch {
            // On-disk store can fail (e.g. migration); in-memory keeps the app usable.
            print("SwiftData on-disk store failed: \(error). Using in-memory container.")
            do {
                let container = try RefactorSchema.makeContainer(inMemory: true)
                modelContainer = container
                syncEngine = SyncEngine(modelContainer: container)
            } catch {
                fatalError("SwiftData could not start: \(error)")
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authService)
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
    @Environment(AppCoordinator.self) private var coordinator
    @Environment(\.syncEngine) private var syncEngine
    @Environment(\.scenePhase) private var scenePhase

    @AppStorage("appColorScheme") private var colorSchemePref: String = AppColorScheme.system.rawValue

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
            } else {
                OnboardingView()
            }
        }
        .preferredColorScheme(preferredScheme)
        .task {
            await auth.checkSession()
            if auth.isAuthenticated, let engine = syncEngine {
                try? await engine.fetchAndApply()
            }
        }
        .onChange(of: auth.isAuthenticated) { _, isAuthenticated in
            guard isAuthenticated, let engine = syncEngine else { return }
            Task { try? await engine.fetchAndApply() }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, auth.isAuthenticated, let engine = syncEngine else { return }
            Task { try? await engine.fetchAndApply() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .recompScheduleDataSync)) { _ in
            guard let engine = syncEngine else { return }
            Task { await engine.scheduleSync() }
        }
    }
}

struct CoachFloatingButton: View {
    @State private var showChat = false

    var body: some View {
        Button {
            showChat = true
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
        .sheet(isPresented: $showChat) {
            CoachChatView()
        }
    }
}
