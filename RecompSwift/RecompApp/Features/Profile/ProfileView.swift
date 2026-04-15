import SwiftUI
import SwiftData
import RefactorKit

struct ProfileView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @AppStorage("appColorScheme") private var colorSchemePref: String = AppColorScheme.system.rawValue
    @State private var isSyncing = false
    @State private var syncError: String?
    @State private var syncSuccess = false

    var body: some View {
        NavigationStack {
            List {
                if let user = auth.currentUser {
                    profileHeader(user)
                }

                Section("Appearance") {
                    Picker("Theme", selection: $colorSchemePref) {
                        ForEach(AppColorScheme.allCases, id: \.rawValue) { scheme in
                            Label {
                                Text(scheme.rawValue)
                            } icon: {
                                Image(systemName: scheme == .system ? "circle.lefthalf.filled" :
                                                  scheme == .light  ? "sun.max"               : "moon")
                            }
                            .tag(scheme.rawValue)
                        }
                    }
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
                        Label("Ref Schedule", systemImage: "clock")
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

                Section("Tools") {
                    NavigationLink {
                        ResearchView()
                    } label: {
                        Label("Research", systemImage: "books.vertical")
                    }
                }

                Section {
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

                    Button {
                        Task { await syncNow() }
                    } label: {
                        HStack {
                            if isSyncing {
                                ProgressView().scaleEffect(0.8)
                            } else if syncSuccess {
                                Label("Synced", systemImage: "checkmark.icloud.fill")
                                    .foregroundStyle(Color.appSuccess)
                            } else {
                                Label("Sync Now", systemImage: "arrow.triangle.2.circlepath.icloud")
                            }
                            Spacer()
                            if let syncError {
                                Text(syncError)
                                    .font(.caption)
                                    .foregroundStyle(Color.appError)
                                    .lineLimit(2)
                            }
                        }
                    }
                    .disabled(isSyncing)

                    Button(role: .destructive) {
                        auth.logout()
                    } label: {
                        Label("Log Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                } header: {
                    Text("Account")
                } footer: {
                    Text("Log out to return to the sign-in screen and use a different account.")
                        .font(.caption)
                }

                Section {
                    Button {
                        Task {
                            try? await APIClient.shared.requestVoid(
                                MiscAPI.feedbackSubmit(
                                    rating: nil,
                                    text: "Feedback from Recomp iOS app"
                                )
                            )
                        }
                    } label: {
                        Label("Send Feedback", systemImage: "envelope")
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }

    private func syncNow() async {
        isSyncing = true
        syncError = nil
        syncSuccess = false
        defer { isSyncing = false }
        do {
            guard let engine = syncEngine else {
                syncError = "Sync unavailable"
                return
            }
            try await engine.fetchAndApply()
            syncSuccess = true
            Task {
                try? await Task.sleep(for: .seconds(3))
                syncSuccess = false
            }
        } catch {
            syncError = error.localizedDescription
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
                    .foregroundStyle(Color.appError)
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
    @State private var isSaving = false
    @State private var didSave = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            if let errorMessage {
                Section {
                    Text(errorMessage).font(.caption).foregroundStyle(Color.appError)
                }
            }
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
                Text("At least 3 characters to claim a username on save.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Section {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text(didSave ? "Saved" : "Save to server")
                    }
                }
                .disabled(isSaving)
            }
        }
        .navigationTitle("Social Settings")
        .task {
            await load()
        }
    }

    private func load() async {
        errorMessage = nil
        do {
            let dto: SocialSettingsDTO = try await APIClient.shared.request(SocialAPI.getSettings)
            if let v = dto.visibility, let parsed = ProfileVisibility(rawValue: v) {
                visibility = parsed
            }
            username = dto.username ?? ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func save() async {
        isSaving = true
        didSave = false
        errorMessage = nil
        defer { isSaving = false }
        do {
            let trimmed = username.trimmingCharacters(in: .whitespacesAndNewlines)
            try await APIClient.shared.requestVoid(
                SocialAPI.updateSettings(
                    visibility: visibility.rawValue,
                    username: trimmed.count >= 3 ? trimmed : nil
                )
            )
            didSave = true
        } catch {
            errorMessage = error.localizedDescription
        }
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
        .navigationTitle("Ref Schedule")
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
                        .foregroundStyle(supp.takenToday ? Color.appSuccess : Color.secondary)
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
    @State private var isClaiming = false
    @State private var errorMessage: String?
    @State private var didClaim = false

    private var canSubmit: Bool {
        !email.isEmpty && password.count >= 8 && !isClaiming && !didClaim
    }

    var body: some View {
        Form {
            Section {
                Text("Link an email and password to this account so you can log in from any device or the web app.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section("Link Email & Password") {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                SecureField("Password (min 8 characters)", text: $password)
                    .textContentType(.newPassword)
            }

            if let errorMessage {
                Section {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Color.appError)
                        Text(errorMessage).foregroundStyle(Color.appError).font(.subheadline)
                    }
                }
            }

            Section {
                Button {
                    Task { await claim() }
                } label: {
                    HStack {
                        Spacer()
                        if isClaiming {
                            ProgressView()
                        } else if didClaim {
                            Label("Account Claimed", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(Color.appSuccess)
                        } else {
                            Text("Claim Account").fontWeight(.semibold)
                        }
                        Spacer()
                    }
                }
                .disabled(!canSubmit)
            }
        }
        .navigationTitle("Claim Account")
    }

    private func claim() async {
        isClaiming = true
        errorMessage = nil
        defer { isClaiming = false }
        do {
            try await auth.claimAccount(email: email, password: password)
            didClaim = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct CalendarFeedView: View {
    @State private var feedURL = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section {
                Text("Subscribe to your Refactor calendar to see workouts and meals in Apple Calendar.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).font(.caption).foregroundStyle(Color.appError)
                }
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
                    Task { await generateFeed() }
                }
                .disabled(isLoading)
            }
        }
        .navigationTitle("Calendar Feed")
    }

    private func calendarBaseURL() -> String {
        let env = ProcessInfo.processInfo.environment["RECOMP_API_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        let raw = (env?.isEmpty == false ? env! : "https://refactor-one.vercel.app").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return raw
    }

    private func generateFeed() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let res: CalendarTokenResponse = try await APIClient.shared.request(CalendarAPI.generateToken)
            let base = calendarBaseURL()
            if let embedded = res.feedUrl, !embedded.isEmpty {
                feedURL = embedded
            } else {
                let enc = res.token.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? res.token
                feedURL = "\(base)/api/calendar/feed?token=\(enc)"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
