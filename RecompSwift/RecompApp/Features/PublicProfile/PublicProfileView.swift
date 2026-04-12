import SwiftUI
import RefactorKit

struct PublicProfileView: View {
    let usernameOrId: String
    @State private var profile: PublicProfile?
    @State private var isLoading = true

    var body: some View {
        ScrollView {
            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 300)
            } else if let profile {
                VStack(spacing: 20) {
                    AvatarView(dataUrl: profile.avatarDataUrl, name: profile.name, size: 80)

                    VStack(spacing: 4) {
                        Text(profile.name)
                            .font(.title2.weight(.bold))
                        Text("@\(profile.username)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(profile.goal.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                            .font(.caption)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(.blue.opacity(0.1), in: Capsule())
                    }

                    HStack(spacing: 24) {
                        statView("Level", value: "\(profile.xpLevel)")
                        statView("XP", value: "\(profile.xp)")
                        if let streak = profile.streakLength {
                            statView("Streak", value: "\(streak)d")
                        }
                        if let macroHit = profile.macroHitRate {
                            statView("Macro Hit", value: "\(Int(macroHit * 100))%")
                        }
                    }

                    if !profile.badges.isEmpty {
                        GroupBox("Badges") {
                            Text("\(profile.badges.count) badges earned")
                                .font(.subheadline)
                        }
                    }

                    if let meals = profile.recentMeals, !meals.isEmpty {
                        GroupBox("Recent Meals") {
                            ForEach(meals, id: \.name) { meal in
                                HStack {
                                    Text(meal.name)
                                        .font(.subheadline)
                                    Spacer()
                                    Text("\(meal.macros.calories) cal")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                .padding()
            }
        }
        .navigationTitle("Profile")
        .task { await loadProfile() }
    }

    private func statView(_ label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.title3.weight(.bold))
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func loadProfile() async {
        isLoading = true
        do {
            profile = try await APIClient.shared.request(SocialAPI.publicProfile(usernameOrId: usernameOrId))
        } catch {}
        isLoading = false
    }
}
