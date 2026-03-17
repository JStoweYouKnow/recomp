import SwiftUI
import SwiftData

struct ProfileView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var context
    @State private var selectedSection = 0

    var body: some View {
        NavigationStack {
            List {
                if let user = auth.currentUser {
                    profileHeader(user)
                }

                Section("Settings") {
                    NavigationLink {
                        WearableConnectionsView()
                    } label: {
                        Label("Wearables", systemImage: "applewatch")
                    }

                    NavigationLink {
                        SocialSettingsView()
                    } label: {
                        Label("Social & Privacy", systemImage: "person.2")
                    }

                    NavigationLink {
                        PushNotificationSettings()
                    } label: {
                        Label("Notifications", systemImage: "bell")
                    }

                    NavigationLink {
                        CoachScheduleView()
                    } label: {
                        Label("Coach Schedule", systemImage: "clock")
                    }
                }

                Section("Health") {
                    NavigationLink {
                        SupplementsView()
                    } label: {
                        Label("Supplements", systemImage: "pills")
                    }

                    NavigationLink {
                        BloodWorkView()
                    } label: {
                        Label("Blood Work", systemImage: "cross.case")
                    }
                }

                Section("Account") {
                    NavigationLink {
                        ClaimAccountView()
                    } label: {
                        Label("Claim Account", systemImage: "person.badge.key")
                    }

                    NavigationLink {
                        CalendarFeedView()
                    } label: {
                        Label("Calendar Feed", systemImage: "calendar")
                    }

                    Button(role: .destructive) {
                        auth.logout()
                    } label: {
                        Label("Log Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }

                Section {
                    Button {
                        // Submit feedback
                    } label: {
                        Label("Send Feedback", systemImage: "envelope")
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }

    private func profileHeader(_ user: UserProfile) -> some View {
        Section {
            HStack(spacing: 16) {
                AvatarView(dataUrl: user.avatarDataUrl, name: user.name, size: 64)

                VStack(alignment: .leading, spacing: 4) {
                    Text(user.name)
                        .font(.title3.weight(.semibold))

                    Text(user.goal.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 8) {
                        Label(user.fitnessLevel.rawValue.capitalized, systemImage: "figure.run")
                        Label(user.dailyActivityLevel.rawValue.capitalized, systemImage: "bolt")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
        }
    }
}

struct WearableConnectionsView: View {
    var body: some View {
        List {
            Section("Connected") {
                Label("Apple Health", systemImage: "heart.fill")
                    .foregroundStyle(.red)
            }

            Section("Available") {
                Button {
                    // Oura OAuth
                } label: {
                    Label("Connect Oura", systemImage: "circle.dashed")
                }

                Button {
                    // Fitbit OAuth
                } label: {
                    Label("Connect Fitbit", systemImage: "circle.dashed")
                }
            }
        }
        .navigationTitle("Wearables")
    }
}

struct SocialSettingsView: View {
    @State private var visibility: ProfileVisibility = .badgesOnly
    @State private var username = ""

    var body: some View {
        Form {
            Section("Visibility") {
                Picker("Profile Visibility", selection: $visibility) {
                    Text("Badges Only").tag(ProfileVisibility.badgesOnly)
                    Text("Badges & Stats").tag(ProfileVisibility.badgesStats)
                    Text("Full Transparency").tag(ProfileVisibility.fullTransparency)
                }
            }

            Section("Username") {
                TextField("username", text: $username)
                    .autocapitalization(.none)
            }
        }
        .navigationTitle("Social Settings")
    }
}

struct PushNotificationSettings: View {
    @State private var mealReminders = true
    @State private var workoutReminders = true
    @State private var hydrationReminders = false
    @State private var coachCheckIns = true

    var body: some View {
        Form {
            Toggle("Meal Reminders", isOn: $mealReminders)
            Toggle("Workout Reminders", isOn: $workoutReminders)
            Toggle("Hydration Reminders", isOn: $hydrationReminders)
            Toggle("Coach Check-Ins", isOn: $coachCheckIns)
        }
        .navigationTitle("Notifications")
    }
}

struct CoachScheduleView: View {
    @State private var checkInTimes: [String] = ["08:00", "12:00", "20:00"]

    var body: some View {
        Form {
            Section("Check-In Times") {
                ForEach(checkInTimes, id: \.self) { time in
                    Text(time)
                }
            }
        }
        .navigationTitle("Coach Schedule")
    }
}

struct SupplementsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Supplement.name) private var supplements: [Supplement]

    var body: some View {
        List {
            ForEach(supplements, id: \.id) { supp in
                HStack {
                    VStack(alignment: .leading) {
                        Text(supp.name).font(.body.weight(.medium))
                        Text("\(supp.dosage) · \(supp.frequency.rawValue.replacingOccurrences(of: "_", with: " "))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: supp.takenToday ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(supp.takenToday ? .green : .secondary)
                        .onTapGesture {
                            supp.takenToday.toggle()
                        }
                }
            }
            .onDelete { indices in
                for i in indices { context.delete(supplements[i]) }
            }
        }
        .navigationTitle("Supplements")
    }
}

struct BloodWorkView: View {
    var body: some View {
        VStack {
            EmptyStateView(
                icon: "cross.case",
                title: "No Blood Work",
                subtitle: "Upload a photo of your lab results for AI analysis",
                actionTitle: "Upload Photo"
            ) {}
        }
        .navigationTitle("Blood Work")
    }
}

struct ClaimAccountView: View {
    @Environment(AuthService.self) private var auth
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        Form {
            Section("Link Email & Password") {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                SecureField("Password", text: $password)
                    .textContentType(.newPassword)
            }

            Section {
                Button("Claim Account") {
                    Task {
                        try? await auth.claimAccount(email: email, password: password)
                    }
                }
                .disabled(email.isEmpty || password.isEmpty)
            }
        }
        .navigationTitle("Claim Account")
    }
}

struct CalendarFeedView: View {
    @State private var feedURL = ""

    var body: some View {
        Form {
            Section {
                Text("Subscribe to your Recomp calendar to see workouts and meals in Apple Calendar.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if !feedURL.isEmpty {
                Section("Feed URL") {
                    Text(feedURL)
                        .font(.caption)
                        .textSelection(.enabled)
                }
            }

            Section {
                Button("Generate Feed URL") {
                    // Generate calendar token
                }
            }
        }
        .navigationTitle("Calendar Feed")
    }
}
