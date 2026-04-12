import SwiftUI
import SwiftData
import RefactorKit

struct MyProgressView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Milestone.earnedAt) private var milestones: [Milestone]
    @State private var selectedTab = 0
    @State private var xp = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Section", selection: $selectedTab) {
                    Text("Badges").tag(0)
                    Text("Body").tag(1)
                    Text("Insights").tag(2)
                }
                .pickerStyle(.segmented)
                .padding()

                switch selectedTab {
                case 0: badgesSection
                case 1: bodySection
                case 2: insightsSection
                default: badgesSection
                }
            }
            .navigationTitle("My Progress")
        }
    }

    private var badgesSection: some View {
        ScrollView {
            VStack(spacing: 20) {
                XPLevelView(xp: xp)

                BadgesGrid(earned: milestones)
            }
            .padding()
        }
    }

    private var bodySection: some View {
        ScrollView {
            VStack(spacing: 16) {
                MeasurementsView()
                SmartScaleEntryView()
                ProgressPhotosSection()
            }
            .padding()
        }
    }

    private var insightsSection: some View {
        ScrollView {
            VStack(spacing: 16) {
                BiofeedbackInsightsView()
                WeeklyRecapCard()
            }
            .padding()
        }
    }
}

struct XPLevelView: View {
    let xp: Int

    private var level: Int { MacroCalculator.xpLevel(for: xp) }
    private var progress: (current: Int, needed: Int) { MacroCalculator.xpToNextLevel(currentXP: xp) }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Level \(level)")
                    .font(.title2.weight(.bold))
                Spacer()
                Text("\(xp) XP")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(.purple.opacity(0.2))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(.purple)
                        .frame(width: geo.size.width * (Double(progress.current) / Double(max(progress.needed, 1))))
                }
            }
            .frame(height: 8)

            Text("\(progress.current)/\(progress.needed) XP to next level")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct BadgesGrid: View {
    let earned: [Milestone]
    private let columns = [GridItem(.adaptive(minimum: 80))]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 16) {
            ForEach(MilestoneType.allCases) { type in
                let milestone = earned.first { $0.milestoneType == type }
                let isEarned = milestone != nil

                VStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .fill(isEarned ? .yellow.opacity(0.2) : .gray.opacity(0.1))
                            .frame(width: 56, height: 56)

                        Image(systemName: badgeIcon(for: type))
                            .font(.title3)
                            .foregroundStyle(isEarned ? .yellow : .gray.opacity(0.4))
                    }

                    Text(badgeLabel(for: type))
                        .font(.caption2)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(isEarned ? .primary : .secondary)
                }
            }
        }
    }

    private func badgeIcon(for type: MilestoneType) -> String {
        switch type {
        case .firstMeal: return "fork.knife.circle"
        case .mealStreak3, .mealStreak7, .mealStreak14, .mealStreak30: return "flame"
        case .macroHitWeek, .macroHitMonth: return "target"
        case .weekWarrior: return "trophy"
        case .planAdjuster: return "slider.horizontal.3"
        case .earlyAdopter: return "star"
        case .wearableSynced: return "applewatch"
        case .hydrationStreak3, .hydrationStreak7: return "drop"
        case .firstFast, .fastingStreak7: return "timer"
        case .biofeedbackStreak7: return "heart.text.square"
        case .metabolicModeled: return "chart.xyaxis.line"
        case .recoveryListener: return "bed.double"
        case .pantryStocked: return "refrigerator"
        case .firstMealPrep: return "takeoutbag.and.cup.and.straw"
        case .menuScanner: return "doc.viewfinder"
        case .coachCheckInStreak7: return "bubble.left.and.text.bubble.right"
        case .firstChallengeWon: return "medal"
        case .challengeCreator: return "flag"
        case .musicConnected: return "music.note"
        case .supplementTracker: return "pills"
        case .bloodWorkUploaded: return "cross.case"
        }
    }

    private func badgeLabel(for type: MilestoneType) -> String {
        type.rawValue.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

struct MeasurementsView: View {
    var body: some View {
        GroupBox("Measurements") {
            VStack(spacing: 8) {
                measurementRow("Target Weight", value: "—")
                measurementRow("Body Fat %", value: "—")
                measurementRow("Muscle Mass", value: "—")
            }
        }
    }

    private func measurementRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(.subheadline)
            Spacer()
            Text(value).font(.subheadline.weight(.medium))
        }
    }
}

struct SmartScaleEntryView: View {
    @State private var weight = ""

    var body: some View {
        GroupBox("Smart Scale Entry") {
            TextField("Weight", text: $weight)
                .keyboardType(.decimalPad)
            Button("Save Entry") {}
                .buttonStyle(.bordered)
                .disabled(weight.isEmpty)
        }
    }
}

struct ProgressPhotosSection: View {
    var body: some View {
        GroupBox("Progress Photos") {
            HStack(spacing: 16) {
                photoPlaceholder("Front")
                photoPlaceholder("Side")
                photoPlaceholder("Back")
            }
        }
    }

    private func photoPlaceholder(_ label: String) -> some View {
        VStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(.gray.opacity(0.1))
                .frame(height: 100)
                .overlay {
                    Image(systemName: "camera")
                        .foregroundStyle(.secondary)
                }
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct BiofeedbackInsightsView: View {
    var body: some View {
        GroupBox("Biofeedback Insights") {
            Text("Log biofeedback entries for 7+ days to see AI-generated insights")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct WeeklyRecapCard: View {
    var body: some View {
        GroupBox("Weekly Recap") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Complete a full week to generate your recap card")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
