import SwiftUI

@Observable
final class AppCoordinator {
    var selectedTab: Tab = .dashboard
    var dashboardPath = NavigationPath()
    var mealsPath = NavigationPath()
    var workoutsPath = NavigationPath()
    var progressPath = NavigationPath()

    enum Tab: String, CaseIterable, Identifiable {
        case dashboard = "Dashboard"
        case meals = "Meals"
        case workouts = "Workouts"
        case adjust = "Adjust"
        case progress = "Progress"
        case groups = "Groups"
        case profile = "Profile"

        var id: String { rawValue }

        var icon: String {
            switch self {
            case .dashboard: return "square.grid.2x2"
            case .meals: return "fork.knife"
            case .workouts: return "dumbbell"
            case .adjust: return "slider.horizontal.3"
            case .progress: return "chart.line.uptrend.xyaxis"
            case .groups: return "person.3"
            case .profile: return "person.crop.circle"
            }
        }

        static var mobileTabs: [Tab] {
            [.dashboard, .meals, .workouts, .adjust]
        }

        static var allTabs: [Tab] {
            allCases
        }
    }

    func navigate(to tab: Tab) {
        if selectedTab == tab {
            resetNavigation(for: tab)
        } else {
            selectedTab = tab
        }
    }

    private func resetNavigation(for tab: Tab) {
        switch tab {
        case .dashboard: dashboardPath = NavigationPath()
        case .meals: mealsPath = NavigationPath()
        case .workouts: workoutsPath = NavigationPath()
        case .progress: progressPath = NavigationPath()
        default: break
        }
    }
}

struct MainTabView: View {
    @Environment(AppCoordinator.self) private var coordinator

    var body: some View {
        @Bindable var coord = coordinator

        TabView(selection: $coord.selectedTab) {
            ForEach(AppCoordinator.Tab.allTabs) { tab in
                LazyTabContent(tab: tab)
                    .tabItem {
                        Label(tab.rawValue, systemImage: tab.icon)
                    }
                    .tag(tab)
            }
        }
        .tint(Color.appAccent)
    }
}

/// SwiftUI `TabView` builds every tab's body at launch. Defer only Workouts
/// (catch-up queries) until first visit so cold start stays stable.
///
/// Do **not** placeholder overflow/"More" tabs (Progress, Groups, Profile) —
/// UIKit's More navigation pushes those VCs with a collapsed placeholder layout,
/// which shows as a blank screen. Always mount those destinations. Sync finishes
/// before `MainTabView` appears, so mounting Progress at tab-shell time is safe.
private struct LazyTabContent: View {
    @Environment(AppCoordinator.self) private var coordinator
    let tab: AppCoordinator.Tab
    @State private var activated = false

    /// Only defer Workouts (visible tab bar). Progress/Groups/Profile live under
    /// "More" and must mount immediately — deferred placeholders collapse there.
    private var defersUntilSelected: Bool {
        tab == .workouts
    }

    var body: some View {
        Group {
            if !defersUntilSelected || activated {
                tab.destinationView
            } else {
                Color.recompBackground
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.recompBackground)
        .onAppear {
            guard defersUntilSelected else { return }
            if coordinator.selectedTab == tab {
                activated = true
            }
        }
        .onChange(of: coordinator.selectedTab) { _, selected in
            guard defersUntilSelected else { return }
            if selected == tab {
                activated = true
            }
        }
    }
}

extension AppCoordinator.Tab {
    @ViewBuilder
    var destinationView: some View {
        switch self {
        case .dashboard: DashboardView()
        case .meals: MealsView()
        case .workouts: WorkoutsView()
        case .adjust: AdjustView()
        case .progress: MyProgressView()
        case .groups: GroupsView()
        case .profile: ProfileView()
        }
    }
}
