import SwiftUI
import RefactorKit

struct GroupsView: View {
    @Environment(AuthService.self) private var auth
    @State private var groupService = GroupService()
    @State private var selectedTab = 0
    @State private var showCreate = false
    @State private var showJoinByCode = false
    @State private var showCreateChallenge = false
    @State private var showSprintSheet = false
    @State private var joinCode = ""
    @State private var joinError: String?
    @State private var selectedGroupId: IdentifiedString?
    @State private var fetchError: String?
    @State private var actionError: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Section", selection: $selectedTab) {
                    Text("Mine").tag(0)
                    Text("Discover").tag(1)
                    Text("Challenges").tag(2)
                }
                .pickerStyle(.segmented)
                .padding()

                switch selectedTab {
                case 0: myGroupsList
                case 1: discoverList
                case 2: challengesList
                default: myGroupsList
                }
            }
            .navigationTitle("Groups")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { showCreate = true } label: {
                            Label("New Group", systemImage: "person.3.fill")
                        }
                        Button { showJoinByCode = true } label: {
                            Label("Join with Code", systemImage: "number")
                        }
                        if selectedTab == 2 {
                            Button { showSprintSheet = true } label: {
                                Label("7-Day Sprint", systemImage: "bolt.fill")
                            }
                            Button { showCreateChallenge = true } label: {
                                Label("Custom Challenge", systemImage: "flag.fill")
                            }
                        }
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                }
            }
            .sheet(isPresented: $showJoinByCode) {
                JoinGroupCodeSheet(
                    groupService: groupService,
                    code: $joinCode,
                    error: $joinError
                )
            }
            .sheet(isPresented: $showCreate) {
                CreateGroupSheet(groupService: groupService)
            }
            .sheet(isPresented: $showCreateChallenge) {
                CreateChallengeSheet(groupService: groupService)
            }
            .sheet(isPresented: $showSprintSheet) {
                SprintChallengeSheet(groupService: groupService)
            }
            .sheet(item: $selectedGroupId) { item in
                GroupDetailView(groupId: item.value, groupService: groupService)
            }
            .task {
                do {
                    try await groupService.fetchMyGroups()
                } catch {
                    fetchError = error.localizedDescription
                }
            }
            .alert("Error", isPresented: Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(actionError ?? "")
            }
        }
    }

    private var myGroupsList: some View {
        Group {
            if let fetchError {
                VStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(Color.appError)
                    Text(fetchError).font(.caption).foregroundStyle(Color.appError).multilineTextAlignment(.center)
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if groupService.myGroups.isEmpty {
                EmptyStateView(
                    icon: "person.3",
                    title: "No Groups",
                    subtitle: "Join or create a group to stay accountable",
                    actionTitle: "Create Group"
                ) { showCreate = true }
            } else {
                List(groupService.myGroups, id: \.groupId) { membership in
                    Button {
                        selectedGroupId = IdentifiedString(value: membership.groupId)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(membership.groupName).font(.body.weight(.medium))
                                Text(membership.role.rawValue.capitalized)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var discoverList: some View {
        List(groupService.discoverGroups, id: \.id) { group in
            VStack(alignment: .leading, spacing: 4) {
                Text(group.name).font(.body.weight(.medium))
                Text(group.descriptionText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                HStack {
                    Label("\(group.memberCount)", systemImage: "person.2")
                        .font(.caption2)
                    Text(group.goalType.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.appAccent.opacity(0.1), in: Capsule())
                }
            }
        }
        .listStyle(.plain)
        .task {
            do {
                try await groupService.fetchDiscoverGroups()
            } catch {
                fetchError = error.localizedDescription
            }
        }
    }

    private var challengesList: some View {
        List(groupService.challenges, id: \.id) { challenge in
            VStack(alignment: .leading, spacing: 8) {
                Text(challenge.title).font(.body.weight(.medium))
                Text(challenge.descriptionText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack {
                    Text(challenge.status.rawValue.capitalized)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(challenge.status == .active ? Color.appSuccess.opacity(0.1) : Color.secondary.opacity(0.1), in: Capsule())
                    Spacer()
                    Text("\(challenge.participants.count) participants")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                let uid = auth.currentUser?.id
                let myParticipant = uid.flatMap { u in challenge.participants.first { $0.userId == u } }
                let joined = myParticipant != nil
                if joined && challenge.status == .active {
                    let fraction = challenge.target > 0 ? min((myParticipant?.progress ?? 0) / challenge.target, 1.0) : 0
                    ProgressView(value: fraction)
                        .tint(Color.appSuccess)
                    Text("\(Int(myParticipant?.progress ?? 0)) / \(Int(challenge.target))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    HStack(spacing: 10) {
                        Button("Join") {
                            Task {
                                guard !joined else { return }
                                do {
                                    try await groupService.joinChallenge(id: challenge.id)
                                } catch {
                                    actionError = error.localizedDescription
                                }
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .disabled(joined || challenge.status == .completed)

                        if joined {
                            Button("Leave", role: .destructive) {
                                Task {
                                    do {
                                        try await groupService.leaveChallenge(id: challenge.id)
                                    } catch {
                                        actionError = error.localizedDescription
                                    }
                                }
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .task {
            do {
                try await groupService.fetchChallenges()
            } catch {
                fetchError = error.localizedDescription
            }
        }
    }
}

struct JoinGroupCodeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let groupService: GroupService
    @Binding var code: String
    @Binding var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Text(error).foregroundStyle(Color.appError).font(.caption)
                }
                TextField("Invite code", text: $code)
                    .textInputAutocapitalization(.characters)
            }
            .navigationTitle("Join Group")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        error = nil
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Join") {
                        Task {
                            do {
                                try await groupService.joinByCode(code.trimmingCharacters(in: .whitespacesAndNewlines))
                                code = ""
                                error = nil
                                dismiss()
                            } catch let err {
                                error = err.localizedDescription
                            }
                        }
                    }
                    .disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).count < 4)
                }
            }
        }
    }
}

struct CreateChallengeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let groupService: GroupService

    @State private var title = ""
    @State private var description = ""
    @State private var metric = "steps"
    @State private var target: Double = 10000
    @State private var stakes = ""
    @State private var createError: String?

    var body: some View {
        NavigationStack {
            Form {
                if let createError {
                    Section {
                        Text(createError).font(.caption).foregroundStyle(Color.appError)
                    }
                }
                Section("Challenge") {
                    TextField("Title", text: $title)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(3)
                    TextField("Metric key", text: $metric)
                        .font(.caption)
                    Stepper("Target: \(Int(target))", value: $target, in: 1000...100_000, step: 500)
                    TextField("Stakes (optional)", text: $stakes)
                }
            }
            .navigationTitle("New Challenge")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            let today = DateHelpers.todayString()
                            let end = DateHelpers.dateString(from: Calendar.current.date(byAdding: .day, value: 14, to: Date()) ?? Date())
                            let payload = CreateChallengePayload(
                                type: "custom",
                                title: title,
                                description: description,
                                metric: metric,
                                target: target,
                                startDate: today,
                                endDate: end,
                                stakes: stakes.isEmpty ? nil : stakes,
                                groupId: nil
                            )
                            do {
                                try await groupService.createChallenge(payload)
                                dismiss()
                            } catch {
                                createError = error.localizedDescription
                            }
                        }
                    }
                    .disabled(title.isEmpty)
                }
            }
        }
    }
}

struct SprintChallengeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let groupService: GroupService

    @State private var metric = "xp_gained"
    @State private var createError: String?

    private let options: [(value: String, label: String, defaultTarget: Double)] = [
        ("xp_gained",       "XP earned (overall effort)",  700),
        ("meal_streak",     "Meal logging streak",          7),
        ("steps",           "Total steps",                  70_000),
        ("macro_accuracy",  "Macro accuracy",               700),
    ]

    var body: some View {
        NavigationStack {
            Form {
                if let createError {
                    Section {
                        Text(createError).font(.caption).foregroundStyle(Color.appError)
                    }
                }
                Section {
                    Text("Compete with your group for 7 days, starting today.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Section("What are you competing on?") {
                    Picker("Metric", selection: $metric) {
                        ForEach(options, id: \.value) { opt in
                            Text(opt.label).tag(opt.value)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
            }
            .navigationTitle("7-Day Sprint")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Start") {
                        Task {
                            let target = options.first { $0.value == metric }?.defaultTarget ?? 700
                            let today = DateHelpers.todayString()
                            let end = DateHelpers.dateString(from: Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date())
                            let payload = CreateChallengePayload(
                                type: "solo",
                                title: "7-Day Sprint",
                                description: "7-day group sprint. Who can rack up the most \(metric.replacingOccurrences(of: "_", with: " "))?",
                                metric: metric,
                                target: target,
                                startDate: today,
                                endDate: end,
                                stakes: nil,
                                groupId: nil
                            )
                            do {
                                try await groupService.createChallenge(payload)
                                dismiss()
                            } catch {
                                createError = error.localizedDescription
                            }
                        }
                    }
                }
            }
        }
    }
}

struct IdentifiedString: Identifiable {
    let id = UUID()
    let value: String
}

struct CreateGroupSheet: View {
    @Environment(\.dismiss) private var dismiss
    let groupService: GroupService

    @State private var name = ""
    @State private var description = ""
    @State private var goalType: GroupGoalType = .consistency
    @State private var accessMode: GroupAccessMode = .open
    @State private var trackingMode: GroupTrackingMode = .both
    @State private var createError: String?

    var body: some View {
        NavigationStack {
            Form {
                if let createError {
                    Section {
                        Text(createError).font(.caption).foregroundStyle(Color.appError)
                    }
                }
                Section("Group Info") {
                    TextField("Group Name", text: $name)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(3)
                }

                Section("Settings") {
                    Picker("Goal", selection: $goalType) {
                        ForEach(GroupGoalType.allCases) { goal in
                            Text(goal.rawValue.replacingOccurrences(of: "_", with: " ").capitalized).tag(goal)
                        }
                    }
                    Picker("Access", selection: $accessMode) {
                        Text("Open").tag(GroupAccessMode.open)
                        Text("Invite Only").tag(GroupAccessMode.inviteOnly)
                    }
                    Picker("Tracking", selection: $trackingMode) {
                        ForEach(GroupTrackingMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue.capitalized).tag(mode)
                        }
                    }
                }
            }
            .navigationTitle("Create Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            do {
                                _ = try await groupService.createGroup(
                                    CreateGroupPayload(
                                        name: name,
                                        description: description,
                                        goalType: goalType.rawValue,
                                        goalDescription: nil,
                                        accessMode: accessMode.rawValue,
                                        trackingMode: trackingMode.rawValue
                                    )
                                )
                                dismiss()
                            } catch {
                                createError = error.localizedDescription
                            }
                        }
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }
}

struct GroupDetailView: View {
    let groupId: String
    let groupService: GroupService
    @State private var selectedTab = 0
    @State private var messageText = ""
    @State private var groupError: String?
    @FocusState private var isChatFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Section", selection: $selectedTab) {
                    Text("Chat").tag(0)
                    Text("Activity").tag(1)
                    Text("Members").tag(2)
                }
                .pickerStyle(.segmented)
                .padding()

                switch selectedTab {
                case 0: chatSection
                case 1: activitySection
                default: membersSection
                }
            }
            .navigationTitle(groupService.currentGroup?.name ?? "Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Leave", role: .destructive) {
                        Task {
                            do {
                                try await groupService.leaveGroup(groupId: groupId)
                            } catch {
                                groupError = error.localizedDescription
                            }
                        }
                    }
                }
            }
            .task {
                do {
                    try await groupService.fetchGroupDetail(id: groupId)
                    try await groupService.fetchMessages(groupId: groupId)
                    try await groupService.fetchLeaderboard(groupId: groupId)
                } catch {
                    groupError = error.localizedDescription
                }
            }
            .alert("Error", isPresented: Binding(get: { groupError != nil }, set: { if !$0 { groupError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(groupError ?? "")
            }
        }
    }

    private var chatSection: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(groupService.messages, id: \.id) { msg in
                    HStack(alignment: .top, spacing: 8) {
                        AvatarView(dataUrl: msg.authorAvatarUrl, name: msg.authorName, size: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(msg.authorName).font(.caption.weight(.semibold))
                            Text(msg.text).font(.subheadline)
                        }
                        Spacer()
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.vertical, 8)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 0) {
                Divider()
                HStack {
                    TextField("Message...", text: $messageText)
                        .textFieldStyle(.roundedBorder)
                        .focused($isChatFocused)
                    Button {
                        let text = messageText
                        messageText = ""
                        isChatFocused = false
                        Task {
                            do {
                                try await groupService.sendMessage(groupId: groupId, text: text)
                            } catch {
                                groupError = error.localizedDescription
                                messageText = text
                            }
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                    }
                    .disabled(messageText.isEmpty)
                }
                .padding()
            }
            .background(.regularMaterial)
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { isChatFocused = false }
            }
        }
    }

    private var activitySection: some View {
        List(groupService.leaderboard) { member in
            HStack {
                AvatarView(dataUrl: member.avatarDataUrl, name: member.name, size: 32)
                VStack(alignment: .leading) {
                    Text(member.name).font(.subheadline.weight(.medium))
                    Text("Level \(member.xpLevel) · \(member.streakLength) day streak")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(member.xp) XP")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.appSage)
            }
        }
        .listStyle(.plain)
    }

    private var membersSection: some View {
        List(groupService.leaderboard) { member in
            HStack {
                AvatarView(dataUrl: member.avatarDataUrl, name: member.name, size: 32)
                Text(member.name)
                Spacer()
                Text("\(Int(member.macroHitRate * 100))% macros")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .listStyle(.plain)
    }
}
