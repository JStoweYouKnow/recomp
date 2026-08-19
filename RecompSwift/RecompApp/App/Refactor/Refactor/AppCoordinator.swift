import SwiftUI

@Observable
final class AppCoordinator {
    var selectedTab: Tab = .dashboard
    var dashboardPath = NavigationPath()
    var mealsPath = NavigationPath()
    var workoutsPath = NavigationPath()
    var progressPath = NavigationPath()

    /// Destinations that are routable but not tabs (`adjust`, `groups`). Presented as a
    /// sheet so deep links and coach actions can still reach them from anywhere.
    var modalDestination: Tab?

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

        /// The tab bar. Five is the hard ceiling: at six or more, iOS collapses the
        /// overflow into a UIKit "More" table, which buried Progress and forced the
        /// navigation-bar workarounds this app used to carry.
        ///
        /// `adjust` and `groups` are still routable destinations (deep links, coach
        /// actions, Profile rows) — they are just not tabs.
        static var mobileTabs: [Tab] {
            [.dashboard, .meals, .workouts, .progress, .profile]
        }

        static var allTabs: [Tab] {
            mobileTabs
        }

        var isTab: Bool { Self.mobileTabs.contains(self) }
    }

    func navigate(to tab: Tab) {
        guard tab.isTab else {
            modalDestination = tab
            return
        }
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
        // `adjust` and `groups` bring their own NavigationStack, so they are presented
        // bare (no wrapper stack) and given an explicit Done button instead.
        .sheet(item: $coord.modalDestination) { destination in
            switch destination {
            case .adjust:
                AdjustView(onDone: { coord.modalDestination = nil })
            case .groups:
                GroupsView(onDone: { coord.modalDestination = nil })
            default:
                destination.destinationView
            }
        }
    }
}

/// SwiftUI `TabView` builds every tab's body at launch. Defer Workouts (catch-up
/// queries) and Progress (milestone/measurement queries) until first visit so cold
/// start does not register their SwiftData observers before the user asks for them.
///
/// With five tabs there is no UIKit "More" list, so deferred placeholders are safe
/// everywhere — the collapsed-layout problem that forced eager mounting is gone.
private struct LazyTabContent: View {
    @Environment(AppCoordinator.self) private var coordinator
    let tab: AppCoordinator.Tab
    @State private var activated = false

    private var defersUntilSelected: Bool {
        tab == .workouts || tab == .progress
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
