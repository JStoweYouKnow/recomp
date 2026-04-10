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
                tab.destinationView
                    .tabItem {
                        Label(tab.rawValue, systemImage: tab.icon)
                    }
                    .tag(tab)
            }
        }
        .tint(.blue)
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
