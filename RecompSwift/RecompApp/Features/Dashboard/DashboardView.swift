import SwiftUI
import SwiftData

struct DashboardView: View {
    @Environment(\.modelContext) private var context
    @Environment(AuthService.self) private var auth
    @State private var mealService = MealService()
    @State private var planService = PlanService()
    @State private var selectedDate = Date.now

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    greetingSection
                    calorieBudgetSection
                    CalendarStripView(selectedDate: $selectedDate)
                    todaysPlanSection
                    widgetGrid
                }
                .padding(.vertical)
            }
            .navigationTitle("Dashboard")
            .refreshable {
                await auth.checkSession()
            }
        }
    }

    private var greetingSection: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(greetingText)
                    .font(.title2.weight(.bold))
                Text(DateHelpers.todayString())
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            AvatarView(dataUrl: auth.currentUser?.avatarDataUrl, name: auth.currentUser?.name ?? "User", size: 44)
        }
        .padding(.horizontal)
    }

    private var calorieBudgetSection: some View {
        VStack(spacing: 12) {
            let consumed = mealService.todaysMacros(context: context)
            let plan = planService.currentPlan(context: context)
            let target = plan?.dietPlan.dailyTargets ?? Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)

            CalorieBudgetCard(consumed: consumed.calories, target: target.calories)
            MacroPillsView(consumed: consumed, target: target)
        }
        .padding(.horizontal)
    }

    private var todaysPlanSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let workout = planService.todaysWorkout(context: context) {
                GroupBox {
                    VStack(alignment: .leading, spacing: 8) {
                        Label(workout.day, systemImage: "dumbbell")
                            .font(.headline)
                        Text(workout.focus)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("\(workout.exercises.count) exercises")
                            .font(.caption)
                            .foregroundStyle(.blue)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } label: {
                    Text("Today's Workout")
                        .font(.subheadline.weight(.semibold))
                }
            }
        }
        .padding(.horizontal)
    }

    private var widgetGrid: some View {
        LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 12) {
            HydrationWidget()
            FastingWidget()
            BiofeedbackCard()
            DailyQuestsCard()
        }
        .padding(.horizontal)
    }

    private var greetingText: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let name = auth.currentUser?.name.split(separator: " ").first.map(String.init) ?? "there"
        switch hour {
        case 0..<12: return "Good morning, \(name)"
        case 12..<17: return "Good afternoon, \(name)"
        default: return "Good evening, \(name)"
        }
    }
}

struct CalorieBudgetCard: View {
    let consumed: Int
    let target: Int

    private var remaining: Int { max(target - consumed, 0) }
    private var progress: Double { min(Double(consumed) / Double(max(target, 1)), 1.0) }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("\(remaining) cal remaining")
                    .font(.headline)
                Spacer()
                Text("\(consumed) / \(target)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(.gray.opacity(0.15))

                    RoundedRectangle(cornerRadius: 6)
                        .fill(
                            LinearGradient(
                                colors: progress > 0.9 ? [.red, .orange] : [.green, .blue],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * progress)
                }
            }
            .frame(height: 12)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}
