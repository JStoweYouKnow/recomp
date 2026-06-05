import SwiftUI
import SwiftData
import HealthKit
import PhotosUI
import UserNotifications
import RefactorKit

struct ProfileView: View {
    @Environment(AuthService.self) private var auth
    @Environment(SubscriptionService.self) private var subscriptions
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @AppStorage("appColorScheme") private var colorSchemePref: String = AppColorScheme.system.rawValue
    @State private var isSyncing = false
    @State private var syncError: String?
    @State private var syncSuccess = false
    @State private var showDeleteConfirmation = false
    @State private var isDeletingAccount = false
    @State private var showPaywall = false
    @AppStorage("aiCoachConsentGiven") private var aiConsentGiven = false

    var body: some View {
        NavigationStack {
            List {
                if let user = auth.currentUser {
                    profileHeader(user)
                }

                subscriptionSection

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

                    NavigationLink {
                        MusicPreferenceView()
                    } label: {
                        Label("Music", systemImage: "music.note")
                    }

                    NavigationLink {
                        APITokenView()
                    } label: {
                        Label("Siri Shortcuts / API", systemImage: "link")
                    }

                    if aiConsentGiven {
                        Button(role: .destructive) {
                            aiConsentGiven = false
                        } label: {
                            Label("Revoke AI Access", systemImage: "hand.raised.slash")
                        }
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

                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        if isDeletingAccount {
                            HStack {
                                ProgressView().scaleEffect(0.8)
                                Text("Deleting account…")
                            }
                        } else {
                            Label("Delete Account", systemImage: "trash")
                        }
                    }
                    .disabled(isDeletingAccount)
                } header: {
                    Text("Account")
                } footer: {
                    Text("Deleting your account permanently removes all data and cannot be undone.")
                        .font(.caption)
                }
                .confirmationDialog(
                    "Delete Account",
                    isPresented: $showDeleteConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Delete Account", role: .destructive) {
                        Task { await deleteAccount() }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("This permanently deletes your profile, meals, workouts, and all other data. This cannot be undone.")
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
        .sheet(isPresented: $showPaywall) {
            PaywallView()
        }
        }
    }

    @ViewBuilder
    private var subscriptionSection: some View {
        if subscriptions.isPremium {
            Section {
                HStack(spacing: 12) {
                    Image(systemName: "bolt.fill")
                        .font(.title3)
                        .foregroundStyle(Color.appAccent)
                        .frame(width: 28)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Refactor Pro")
                            .font(.subheadline.weight(.semibold))
                        Text("Active")
                            .font(.caption)
                            .foregroundStyle(Color.appSuccess)
                    }
                    Spacer()
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.appSuccess)
                        .accessibilityHidden(true)
                }
                .padding(.vertical, 2)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Refactor Pro subscription active")

                Button {
                    if let url = URL(string: "itms-apps://apps.apple.com/account/subscriptions") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Label("Manage Subscription", systemImage: "arrow.up.right")
                }
            } header: {
                Text("Subscription")
            }
        } else {
            Section {
                HStack(spacing: 12) {
                    Image(systemName: "bolt.slash")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .frame(width: 28)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Free Plan")
                            .font(.subheadline.weight(.semibold))
                        Text("Upgrade for AI coaching, adaptive macros & more")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 2)
                .accessibilityElement(children: .combine)

                Button {
                    showPaywall = true
                } label: {
                    Label("Upgrade to Pro", systemImage: "bolt.fill")
                        .foregroundStyle(Color.appAccent)
                        .fontWeight(.semibold)
                }

                Button {
                    Task { await subscriptions.restorePurchases() }
                } label: {
                    Label("Restore Purchases", systemImage: "arrow.clockwise")
                }
            } header: {
                Text("Subscription")
            }
        }
    }

    private func deleteAccount() async {
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        try? await auth.deleteAccount()
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
            if !SyncPullErrorFiltering.shouldSuppressUserAlert(for: error) {
                syncError = error.localizedDescription
            }
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

            NavigationLink {
                ProfileEditView(user: user)
            } label: {
                Label("Edit Profile", systemImage: "pencil")
            }
        }
    }
}

struct WearableConnectionsView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Query private var connections: [WearableConnection]

    @State private var isSyncingApple = false
    @State private var showOuraSheet = false
    @State private var isConnectingFitbit = false
    @State private var errorMessage: String?

    private let healthStore = HKHealthStore()

    private var connectedProviders: Set<WearableProvider> {
        Set(connections.map { $0.provider })
    }

    var body: some View {
        List {
            appleHealthSection
            ouraSection
            fitbitSection

            if let errorMessage {
                Section {
                    Text(errorMessage).font(.caption).foregroundStyle(Color.appError)
                }
            }
        }
        .navigationTitle("Wearables")
        .sheet(isPresented: $showOuraSheet) {
            OuraConnectSheet { token in
                Task { await connectOura(token: token) }
            }
        }
    }

    @ViewBuilder
    private var appleHealthSection: some View {
        let connected = connectedProviders.contains(.apple)
        Section {
            HStack {
                Label("Apple Health", systemImage: "heart.fill").foregroundStyle(.red)
                Spacer()
                if connected {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.appSuccess)
                        .accessibilityLabel("Connected")
                }
            }
            if HKHealthStore.isHealthDataAvailable() {
                Button {
                    Task { await syncAppleHealth() }
                } label: {
                    HStack {
                        Label(
                            connected ? "Sync Now" : "Continue",
                            systemImage: "arrow.triangle.2.circlepath"
                        )
                        if isSyncingApple { Spacer(); ProgressView().scaleEffect(0.8) }
                    }
                }
                .disabled(isSyncingApple)
            } else {
                Text("Health data not available on this device.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        } header: {
            Text("Apple Health")
        } footer: {
            Text("Refactor reads steps, active calories, heart rate, resting heart rate, sleep duration, and body weight from Apple Health. No health data is written back to Apple Health.")
                .font(.caption2)
        }
    }

    @ViewBuilder
    private var ouraSection: some View {
        let connected = connectedProviders.contains(.oura)
        Section("Oura Ring") {
            HStack {
                Label("Oura Ring", systemImage: "circle.dashed")
                Spacer()
                if connected {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.appSuccess)
                        .accessibilityLabel("Connected")
                }
            }
            if !connected {
                Button("Connect with Personal Token") { showOuraSheet = true }
            }
        }
    }

    @ViewBuilder
    private var fitbitSection: some View {
        let connected = connectedProviders.contains(.fitbit)
        Section {
            HStack {
                Label("Fitbit", systemImage: "figure.run")
                Spacer()
                if connected {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.appSuccess)
                        .accessibilityLabel("Connected")
                }
            }
            if !connected {
                Button {
                    Task { await connectFitbit() }
                } label: {
                    HStack {
                        Text("Connect via Browser")
                        if isConnectingFitbit { Spacer(); ProgressView().scaleEffect(0.8) }
                    }
                }
                .disabled(isConnectingFitbit)
            }
        } header: {
            Text("Fitbit")
        } footer: {
            if !connected {
                Text("Opens Fitbit OAuth in Safari. Return to the app once authorized.")
                    .font(.caption2)
            }
        }
    }

    // MARK: - Apple Health

    private func syncAppleHealth() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        isSyncingApple = true
        errorMessage = nil
        defer { isSyncingApple = false }

        let readTypes: Set<HKObjectType> = Set([
            HKObjectType.quantityType(forIdentifier: .stepCount),
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
            HKObjectType.quantityType(forIdentifier: .bodyMass),
            HKObjectType.quantityType(forIdentifier: .bodyFatPercentage),
            HKObjectType.quantityType(forIdentifier: .heartRate),
            HKObjectType.quantityType(forIdentifier: .restingHeartRate),
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis),
        ].compactMap { $0 })

        do {
            try await healthStore.requestAuthorization(toShare: [], read: readTypes)

            // Back-fill the last 30 days of activity data in the background.
            // This avoids "no samples found" errors when the user connects early
            // in the day before any steps/calories have been recorded.
            let store = healthStore
            Task {
                let cal = Calendar.current
                for offset in stride(from: -29, through: -1, by: 1) {
                    guard let date = cal.date(byAdding: .day, value: offset, to: Date()) else { continue }
                    if let payload = await HealthKitReader.read(for: date, store: store, includeBodyComp: false) {
                        try? await APIClient.shared.requestVoid(WearableAPI.appleHealthSync(data: payload))
                    }
                }
                await syncEngine?.markDirty()
            }

            // Today's sync — body comp uses the most-recent sample regardless of date.
            if let payload = await HealthKitReader.read(for: Date(), store: healthStore, includeBodyComp: true) {
                try await APIClient.shared.requestVoid(WearableAPI.appleHealthSync(data: payload))
            }

            if !connectedProviders.contains(.apple) {
                context.insert(WearableConnection(provider: .apple))
                try? context.save()
            }
            Task { await syncEngine?.markDirty() }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Oura

    private func connectOura(token: String) async {
        errorMessage = nil
        do {
            try await APIClient.shared.requestVoid(WearableAPI.ouraConnect(token: token))
            if !connectedProviders.contains(.oura) {
                context.insert(WearableConnection(provider: .oura))
                try? context.save()
            }
            Task { await syncEngine?.markDirty() }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Fitbit (browser OAuth; server handles callback; connection appears on next sync)

    private func connectFitbit() async {
        isConnectingFitbit = true
        defer { isConnectingFitbit = false }
        let authURL = APIClient.shared.baseURL.appendingPathComponent("api/wearables/fitbit/auth")
        await UIApplication.shared.open(authURL)
    }
}

struct OuraConnectSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onConnect: (String) async -> Void

    @State private var token = ""
    @State private var isConnecting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Create a Personal Access Token in the Oura Developer Portal, then paste it here.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                Section("Personal Access Token") {
                    TextField("Paste token here", text: $token)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
            }
            .navigationTitle("Connect Oura")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Connect") {
                        isConnecting = true
                        Task {
                            await onConnect(token.trimmingCharacters(in: .whitespacesAndNewlines))
                            isConnecting = false
                            dismiss()
                        }
                    }
                    .disabled(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isConnecting)
                }
            }
        }
    }
}

enum HealthKitReader {
    /// Reads one day's data from HealthKit. Returns nil if the day has no useful samples,
    /// so callers can skip empty days without triggering a server "no samples" error.
    /// Body comp (weight, body fat, resting HR) is always read from the most recent
    /// available sample across all time — not filtered to the specific date — so it's
    /// only included once when `includeBodyComp` is true (today's call).
    static func read(for date: Date, store: HKHealthStore, includeBodyComp: Bool) async -> HealthSyncPayload? {
        let cal = Calendar.current
        let start = cal.startOfDay(for: date)
        let end = cal.date(byAdding: .day, value: 1, to: start) ?? date
        let pred = HKQuery.predicateForSamples(withStart: start, end: end)

        let steps  = await readSum(store, id: .stepCount,          unit: .count(),       pred: pred)
        let energy = await readSum(store, id: .activeEnergyBurned, unit: .kilocalorie(), pred: pred)
        let hr     = await readAvg(store, id: .heartRate,
                                   unit: HKUnit.count().unitDivided(by: .minute()), pred: pred)
        let sleep  = await readSleepMinutes(store, pred: pred)

        var weight: Double?
        var fat: Double?
        var rhr: Double?

        if includeBodyComp {
            // Body mass in kg from HealthKit; server converts to lbs for `WearableDaySummary.weight`.
            weight = await readLatest(store, id: .bodyMass,          unit: .gramUnit(with: .kilo))
            fat    = await readLatest(store, id: .bodyFatPercentage, unit: .percent())
            rhr    = await readLatest(store, id: .restingHeartRate,
                                      unit: HKUnit.count().unitDivided(by: .minute()))
        }

        // Server requires at least one activity metric — it rejects body-comp-only payloads.
        guard steps != nil || energy != nil || hr != nil || sleep != nil else { return nil }

        return HealthSyncPayload(
            steps: steps.map(Int.init),
            activeCalories: energy,
            weight: weight,
            bodyFat: fat,
            sleepMinutes: sleep,
            heartRateAvg: hr.map(Int.init),
            heartRateResting: rhr.map(Int.init),
            date: DateHelpers.dateString(from: date)
        )
    }

    static func readToday(store: HKHealthStore) async -> HealthSyncPayload? {
        await read(for: Date(), store: store, includeBodyComp: true)
    }

    private static func readSum(
        _ store: HKHealthStore,
        id: HKQuantityTypeIdentifier,
        unit: HKUnit,
        pred: NSPredicate
    ) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return nil }
        return await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(
                quantityType: type, quantitySamplePredicate: pred, options: .cumulativeSum
            ) { _, stats, _ in
                cont.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(q)
        }
    }

    private static func readAvg(
        _ store: HKHealthStore,
        id: HKQuantityTypeIdentifier,
        unit: HKUnit,
        pred: NSPredicate
    ) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return nil }
        return await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(
                quantityType: type, quantitySamplePredicate: pred, options: .discreteAverage
            ) { _, stats, _ in
                cont.resume(returning: stats?.averageQuantity()?.doubleValue(for: unit))
            }
            store.execute(q)
        }
    }

    private static func readLatest(
        _ store: HKHealthStore,
        id: HKQuantityTypeIdentifier,
        unit: HKUnit
    ) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return nil }
        return await withCheckedContinuation { cont in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let q = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                cont.resume(returning: (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit))
            }
            store.execute(q)
        }
    }

    private static func readSleepMinutes(_ store: HKHealthStore, pred: NSPredicate) async -> Int? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }
        return await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: type, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                    cont.resume(returning: nil); return
                }
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                ]
                let minutes = samples
                    .filter { asleepValues.contains($0.value) }
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) } / 60.0
                cont.resume(returning: minutes > 0 ? Int(minutes) : nil)
            }
            store.execute(q)
        }
    }
}

struct SocialSettingsView: View {
    @State private var visibility: ProfileVisibility = .badgesOnly
    @State private var username = ""
    @State private var isSaving = false
    @State private var didSave = false
    @State private var errorMessage: String?
    @State private var usernameStatus: UsernameCheckStatus = .idle
    @State private var didCopyLink = false

    private enum UsernameCheckStatus {
        case idle, checking, available, taken
    }

    private var profileURL: String {
        let base = APIClient.shared.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return "\(base)/u/\(username)"
    }

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

            Section {
                TextField("username", text: $username)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                HStack(spacing: 6) {
                    switch usernameStatus {
                    case .idle:
                        Text("At least 3 characters to claim a public username.")
                            .font(.caption2).foregroundStyle(.secondary)
                    case .checking:
                        ProgressView().scaleEffect(0.7)
                        Text("Checking…").font(.caption2).foregroundStyle(.secondary)
                    case .available:
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.appSuccess)
                        Text("Available").font(.caption2).foregroundStyle(Color.appSuccess)
                    case .taken:
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Color.appError)
                        Text("Already taken").font(.caption2).foregroundStyle(Color.appError)
                    }
                }
                if username.count >= 3 {
                    Button {
                        UIPasteboard.general.string = profileURL
                        didCopyLink = true
                        Task {
                            try? await Task.sleep(for: .seconds(2))
                            didCopyLink = false
                        }
                    } label: {
                        Label(
                            didCopyLink ? "Copied!" : "Copy Profile Link",
                            systemImage: didCopyLink ? "checkmark" : "doc.on.doc"
                        )
                        .foregroundStyle(Color.accentColor)
                    }
                }
            } header: {
                Text("Username")
            }
            .task(id: username) {
                guard username.count >= 3 else { usernameStatus = .idle; return }
                usernameStatus = .checking
                try? await Task.sleep(for: .milliseconds(600))
                guard !Task.isCancelled else { return }
                do {
                    let res: UsernameCheckResponse = try await APIClient.shared.request(
                        SocialAPI.checkUsername(username: username)
                    )
                    usernameStatus = res.available ? .available : .taken
                } catch {
                    usernameStatus = .idle
                }
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
    @AppStorage("notif_mealReminders") private var mealReminders = true
    @AppStorage("notif_workoutReminders") private var workoutReminders = true
    @AppStorage("notif_hydrationReminders") private var hydrationReminders = false
    @AppStorage("notif_coachCheckIns") private var coachCheckIns = true
    @State private var authStatus: UNAuthorizationStatus = .notDetermined

    var body: some View {
        Form {
            Section {
                permissionRow
            }
            Section {
                Toggle("Meal Reminders (12 pm daily)", isOn: $mealReminders)
                    .onChange(of: mealReminders) { _, on in schedule(.meal, enabled: on) }
                Toggle("Workout Reminders (7 am daily)", isOn: $workoutReminders)
                    .onChange(of: workoutReminders) { _, on in schedule(.workout, enabled: on) }
                Toggle("Hydration Reminders (3 pm daily)", isOn: $hydrationReminders)
                    .onChange(of: hydrationReminders) { _, on in schedule(.hydration, enabled: on) }
                Toggle("Coach Check-Ins (8 pm daily)", isOn: $coachCheckIns)
                    .onChange(of: coachCheckIns) { _, on in schedule(.coach, enabled: on) }
            }
            .disabled(authStatus == .denied || authStatus == .notDetermined)
        }
        .navigationTitle("Notifications")
        .task { await refreshStatus() }
    }

    @ViewBuilder
    private var permissionRow: some View {
        if authStatus == .authorized || authStatus == .provisional {
            Label("Notifications enabled", systemImage: "bell.fill")
                .foregroundStyle(Color.appSuccess)
        } else if authStatus == .denied {
            VStack(alignment: .leading, spacing: 6) {
                Label("Notifications disabled", systemImage: "bell.slash.fill")
                    .foregroundStyle(Color.appError)
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                .font(.caption)
            }
        } else {
            Button("Enable Notifications") {
                Task { await requestPermission() }
            }
        }
    }

    private func refreshStatus() async {
        authStatus = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    private func requestPermission() async {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            authStatus = granted ? .authorized : .denied
            if granted { scheduleAll() }
        } catch {}
    }

    private func scheduleAll() {
        schedule(.meal,      enabled: mealReminders)
        schedule(.workout,   enabled: workoutReminders)
        schedule(.hydration, enabled: hydrationReminders)
        schedule(.coach,     enabled: coachCheckIns)
    }

    private enum NotifKind {
        case meal, workout, hydration, coach

        var identifier: String {
            switch self {
            case .meal:      return "recomp.meal"
            case .workout:   return "recomp.workout"
            case .hydration: return "recomp.hydration"
            case .coach:     return "recomp.coach"
            }
        }

        var title: String {
            switch self {
            case .meal:      return "Log your meals"
            case .workout:   return "Time to train"
            case .hydration: return "Stay hydrated"
            case .coach:     return "Daily check-in with Ref"
            }
        }

        var body: String {
            switch self {
            case .meal:      return "Keep your macro streak going."
            case .workout:   return "Your workout plan is ready."
            case .hydration: return "You're due for a water check-in."
            case .coach:     return "Tap to share your feedback."
            }
        }

        var hour: Int {
            switch self {
            case .meal:      return 12
            case .workout:   return 7
            case .hydration: return 15
            case .coach:     return 20
            }
        }
    }

    private func schedule(_ kind: NotifKind, enabled: Bool) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [kind.identifier])
        guard enabled, authStatus == .authorized || authStatus == .provisional else { return }

        let content = UNMutableNotificationContent()
        content.title = kind.title
        content.body  = kind.body
        content.sound = .default

        var dc = DateComponents()
        dc.hour   = kind.hour
        dc.minute = 0
        let request = UNNotificationRequest(
            identifier: kind.identifier,
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: dc, repeats: true)
        )
        center.add(request)
    }
}

struct ScheduleItem: Identifiable {
    let id = UUID()
    var date: Date
}

struct CoachScheduleView: View {
    @AppStorage("coachScheduleTimes") private var timesRaw: String = "08:00 12:00 20:00"
    @AppStorage("coachScheduleWeeklyReviewDay") private var weeklyReviewDay: Int = 0
    @State private var items: [ScheduleItem] = []

    private let weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    var body: some View {
        Form {
            Section {
                ForEach($items) { $item in
                    DatePicker(
                        "Check-in",
                        selection: $item.date,
                        displayedComponents: .hourAndMinute
                    )
                    .onChange(of: item.date) { _, _ in saveTimes() }
                }
                .onDelete { indices in
                    items.remove(atOffsets: indices)
                    saveTimes()
                }

                if items.count < 6 {
                    Button {
                        let noon = Calendar.current.date(
                            bySettingHour: 12, minute: 0, second: 0, of: Date()
                        ) ?? Date()
                        items.append(ScheduleItem(date: noon))
                        saveTimes()
                    } label: {
                        Label("Add Time", systemImage: "plus.circle")
                    }
                }
            } header: {
                Text("Check-In Times")
            } footer: {
                Text("Ref sends a daily check-in prompt at each scheduled time.")
            }

            Section {
                Picker("Weekly Review Day", selection: $weeklyReviewDay) {
                    ForEach(0..<7, id: \.self) { i in
                        Text(weekdays[i]).tag(i)
                    }
                }
            } footer: {
                Text("Ref sends your weekly progress summary on this day.")
            }
        }
        .navigationTitle("Ref Schedule")
        .toolbar { EditButton() }
        .onAppear { loadTimes() }
    }

    private func loadTimes() {
        guard items.isEmpty else { return }
        let fmt = DateFormatter()
        fmt.dateFormat = "HH:mm"
        items = timesRaw.split(separator: " ")
            .compactMap { fmt.date(from: String($0)) }
            .map { ScheduleItem(date: $0) }
        if items.isEmpty {
            items = [8, 12, 20].compactMap {
                Calendar.current.date(bySettingHour: $0, minute: 0, second: 0, of: Date())
            }.map { ScheduleItem(date: $0) }
        }
    }

    private func saveTimes() {
        let fmt = DateFormatter()
        fmt.dateFormat = "HH:mm"
        timesRaw = items.map { fmt.string(from: $0.date) }.joined(separator: " ")
    }
}

struct SupplementsView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Query(sort: \Supplement.name) private var supplements: [Supplement]

    @State private var isAnalyzing = false
    @State private var analysisResult: SupplementAnalysisResponse?
    @State private var analysisError: String?
    @AppStorage("aiCoachConsentGiven") private var aiConsentGiven = false
    @State private var showAIConsent = false

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
                            try? context.save()
                            Task { await syncEngine?.markDirty() }
                        }
                }
            }
            .onDelete { indices in
                for i in indices { context.delete(supplements[i]) }
                try? context.save()
                Task { await syncEngine?.markDirty() }
            }

            if !supplements.isEmpty {
                Section {
                    Button {
                        if aiConsentGiven {
                            Task { await analyze() }
                        } else {
                            showAIConsent = true
                        }
                    } label: {
                        HStack {
                            Label("AI Analysis", systemImage: "sparkles")
                            if isAnalyzing { Spacer(); ProgressView().scaleEffect(0.8) }
                        }
                    }
                    .disabled(isAnalyzing)

                    if let err = analysisError {
                        Text(err).font(.caption).foregroundStyle(Color.appError)
                    }
                }

                if let result = analysisResult {
                    if !result.deficiencies.isEmpty {
                        Section("Potential Deficiencies") {
                            ForEach(result.deficiencies, id: \.nutrient) { d in
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text(d.nutrient).font(.subheadline.weight(.medium))
                                        Spacer()
                                        Text(d.severity.capitalized)
                                            .font(.caption2)
                                            .padding(.horizontal, 6).padding(.vertical, 2)
                                            .background(severityColor(d.severity).opacity(0.15))
                                            .foregroundStyle(severityColor(d.severity))
                                            .clipShape(Capsule())
                                    }
                                    Text(d.evidence).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    if !result.recommendations.isEmpty {
                        Section("Recommendations") {
                            ForEach(result.recommendations, id: \.action) { r in
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text(r.action).font(.subheadline.weight(.medium))
                                        Spacer()
                                        Text(r.priority.capitalized)
                                            .font(.caption2)
                                            .padding(.horizontal, 6).padding(.vertical, 2)
                                            .background(priorityColor(r.priority).opacity(0.15))
                                            .foregroundStyle(priorityColor(r.priority))
                                            .clipShape(Capsule())
                                    }
                                    Text(r.reason).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    if !result.interactions.isEmpty {
                        Section("Interactions to Note") {
                            ForEach(result.interactions, id: \.self) { i in
                                Label(i, systemImage: "exclamationmark.triangle")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    Section {
                        Text("Not medical advice. Discuss with a healthcare provider.")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Supplements")
        .sheet(isPresented: $showAIConsent) {
            AIConsentView(
                onAccept: {
                    aiConsentGiven = true
                    showAIConsent = false
                    Task { await analyze() }
                },
                onDecline: { showAIConsent = false }
            )
        }
    }

    private func analyze() async {
        isAnalyzing = true
        analysisError = nil
        defer { isAnalyzing = false }
        let names = supplements.map { $0.name }
        do {
            analysisResult = try await APIClient.shared.request(
                MiscAPI.supplementsAnalyze(supplements: names)
            )
        } catch {
            analysisError = error.localizedDescription
        }
    }

    private func severityColor(_ s: String) -> Color {
        switch s {
        case "confirmed": return Color.appError
        case "likely": return Color.appWarm
        default: return Color.secondary
        }
    }

    private func priorityColor(_ p: String) -> Color {
        switch p {
        case "high": return Color.appError
        case "medium": return Color.appWarm
        default: return Color.appSuccess
        }
    }
}

struct BloodWorkView: View {
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var isUploading = false
    @State private var uploadError: String?
    @State private var result: BloodWorkDTO?
    @AppStorage("aiCoachConsentGiven") private var aiConsentGiven = false
    @State private var showAIConsent = false
    @State private var pendingPhoto: PhotosPickerItem?

    var body: some View {
        Group {
            if let result {
                bloodWorkResults(result)
            } else {
                VStack(spacing: 0) {
                    EmptyStateView(
                        icon: "cross.case",
                        title: "No Blood Work",
                        subtitle: "Upload a photo of your lab results for AI analysis"
                    )

                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        Label("Upload Photo", systemImage: "photo.badge.plus")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.horizontal, 32)
                    .onChange(of: selectedPhoto) { _, item in
                        guard let item else { return }
                        if aiConsentGiven {
                            Task { await uploadPhoto(item) }
                        } else {
                            pendingPhoto = item
                            showAIConsent = true
                        }
                    }

                    if isUploading {
                        ProgressView("Analyzing…").padding(.top, 16)
                    }
                    if let uploadError {
                        Text(uploadError)
                            .font(.caption).foregroundStyle(Color.appError)
                            .multilineTextAlignment(.center)
                            .padding()
                    }
                }
            }
        }
        .navigationTitle("Blood Work")
        .sheet(isPresented: $showAIConsent) {
            AIConsentView(
                onAccept: {
                    aiConsentGiven = true
                    showAIConsent = false
                    if let pending = pendingPhoto {
                        pendingPhoto = nil
                        Task { await uploadPhoto(pending) }
                    }
                },
                onDecline: {
                    showAIConsent = false
                    pendingPhoto = nil
                    selectedPhoto = nil
                }
            )
        }
    }

    @ViewBuilder
    private func bloodWorkResults(_ dto: BloodWorkDTO) -> some View {
        List {
            Section {
                Text("Analyzed \(dto.date)")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Markers") {
                ForEach(dto.markers, id: \.name) { marker in
                    BloodWorkMarkerRow(marker: marker)
                }
            }
            if let notes = dto.notes, !notes.isEmpty {
                Section("Notes") { Text(notes).font(.subheadline) }
            }
            Section {
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label("Upload New Photo", systemImage: "photo.badge.plus")
                }
                .onChange(of: selectedPhoto) { _, item in
                    guard let item else { return }
                    if aiConsentGiven {
                        Task { await uploadPhoto(item) }
                    } else {
                        pendingPhoto = item
                        showAIConsent = true
                    }
                }
                if isUploading {
                    HStack { ProgressView(); Text("Analyzing…").font(.caption) }
                }
                if let uploadError {
                    Text(uploadError).font(.caption).foregroundStyle(Color.appError)
                }
            }
        }
    }

    private func uploadPhoto(_ item: PhotosPickerItem) async {
        isUploading = true
        uploadError = nil
        defer { isUploading = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data),
                  let jpeg = ImageResizer.resizeForAPI(image) else {
                uploadError = "Could not load image data."
                return
            }
            result = try await APIClient.shared.upload(MiscAPI.bloodworkParse, imageData: jpeg)
        } catch {
            uploadError = error.localizedDescription
        }
    }
}

struct BloodWorkMarkerRow: View {
    let marker: BloodWorkMarkerDTO

    private var statusColor: Color {
        switch BloodWorkStatus(rawValue: marker.status) {
        case .low:  return .appWarm
        case .high: return .appError
        default:    return .appSuccess
        }
    }

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(marker.name).font(.subheadline.weight(.medium))
                Text("Normal: \(marker.normalRange.low, specifier: "%.1f")–\(marker.normalRange.high, specifier: "%.1f") \(marker.unit)")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(marker.value, specifier: "%.1f") \(marker.unit)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(statusColor)
                Text(marker.status.capitalized)
                    .font(.caption2).foregroundStyle(statusColor)
            }
        }
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

struct MusicPreferenceView: View {
    @AppStorage("musicProvider") private var musicProviderRaw: String = MusicProvider.appleMusic.rawValue
    @AppStorage("soundEffectsEnabled") private var soundEffectsEnabled: Bool = true

    var body: some View {
        Form {
            Section {
                Picker("Music Provider", selection: $musicProviderRaw) {
                    Text("Apple Music").tag(MusicProvider.appleMusic.rawValue)
                    Text("Spotify").tag(MusicProvider.spotify.rawValue)
                }
                Toggle("Sound Effects", isOn: $soundEffectsEnabled)
            } footer: {
                Text("Your preferred music provider is used when Ref suggests workout playlists.")
            }
        }
        .navigationTitle("Music")
    }
}

struct APITokenView: View {
    @State private var token: String?
    @State private var endpoint: String?
    @State private var isGenerating = false
    @State private var error: String?
    @State private var didCopy = false

    var body: some View {
        Form {
            Section {
                Text("Generate an API token to use Ref from Siri Shortcuts, Home automations, or any HTTP client.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let token {
                Section("Your Token") {
                    Text(token)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .foregroundStyle(.secondary)
                    Button {
                        UIPasteboard.general.string = token
                        didCopy = true
                        Task {
                            try? await Task.sleep(for: .seconds(2))
                            didCopy = false
                        }
                    } label: {
                        Label(
                            didCopy ? "Copied!" : "Copy Token",
                            systemImage: didCopy ? "checkmark" : "doc.on.doc"
                        )
                        .foregroundStyle(Color.accentColor)
                    }
                }

                if let endpoint {
                    Section("Endpoint") {
                        Text(endpoint)
                            .font(.system(.caption, design: .monospaced))
                            .textSelection(.enabled)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Text("Send a POST request with Authorization: Bearer <token> and body { \"message\": \"...\" } to chat with Ref from any automation.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let error {
                Section {
                    Text(error).font(.caption).foregroundStyle(Color.appError)
                }
            }

            Section {
                Button {
                    Task { await generate() }
                } label: {
                    HStack {
                        Label(token == nil ? "Generate Token" : "Regenerate Token", systemImage: "key")
                        if isGenerating { Spacer(); ProgressView().scaleEffect(0.8) }
                    }
                }
                .disabled(isGenerating)
            } footer: {
                if token != nil {
                    Text("Generating a new token revokes the previous one.")
                        .font(.caption2)
                }
            }
        }
        .navigationTitle("Siri Shortcuts / API")
    }

    private func generate() async {
        isGenerating = true
        error = nil
        defer { isGenerating = false }
        do {
            let res: APITokenResponse = try await APIClient.shared.request(MiscAPI.generateAPIToken)
            token = res.token
            endpoint = res.endpoint
        } catch {
            self.error = error.localizedDescription
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
        let raw = (env?.isEmpty == false ? env! : "https://recomp-one.vercel.app").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
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
