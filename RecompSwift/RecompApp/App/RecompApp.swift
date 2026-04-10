import SwiftUI
import SwiftData

@main
struct RecompApp: App {
    @State private var authService = AuthService()
    @State private var coordinator = AppCoordinator()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authService)
                .environment(coordinator)
        }
        .modelContainer(try! RecompSchema.makeContainer())
    }
}

struct RootView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppCoordinator.self) private var coordinator

    var body: some View {
        Group {
            if auth.isLoading {
                LoadingOverlay(message: "Loading...")
            } else if auth.isAuthenticated {
                MainTabView()
                    .overlay(alignment: .bottomTrailing) {
                        CoachFloatingButton()
                    }
            } else {
                OnboardingView()
            }
        }
        .task {
            await auth.checkSession()
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
                        colors: [.blue, .purple],
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
