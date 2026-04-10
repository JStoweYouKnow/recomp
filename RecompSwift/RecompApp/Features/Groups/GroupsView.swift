import SwiftUI

struct GroupsView: View {
    @State private var groupService = GroupService()
    @State private var selectedTab = 0
    @State private var showCreate = false
    @State private var selectedGroupId: IdentifiedString?

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
                    Button { showCreate = true } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                }
            }
            .sheet(isPresented: $showCreate) {
                CreateGroupSheet(groupService: groupService)
            }
            .sheet(item: $selectedGroupId) { item in
                GroupDetailView(groupId: item.value, groupService: groupService)
            }
            .task {
                try? await groupService.fetchMyGroups()
            }
        }
    }

    private var myGroupsList: some View {
        Group {
            if groupService.myGroups.isEmpty {
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
                        .background(.blue.opacity(0.1), in: Capsule())
                }
            }
        }
        .listStyle(.plain)
        .task {
            try? await groupService.fetchDiscoverGroups()
        }
    }

    private var challengesList: some View {
        List(groupService.challenges, id: \.id) { challenge in
            VStack(alignment: .leading, spacing: 4) {
                Text(challenge.title).font(.body.weight(.medium))
                Text(challenge.descriptionText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack {
                    Text(challenge.status.rawValue.capitalized)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(challenge.status == .active ? .green.opacity(0.1) : .gray.opacity(0.1), in: Capsule())
                    Spacer()
                    Text("\(challenge.participants.count) participants")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.plain)
        .task {
            try? await groupService.fetchChallenges()
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

    var body: some View {
        NavigationStack {
            Form {
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
                            _ = try? await groupService.createGroup(
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
            .task {
                try? await groupService.fetchGroupDetail(id: groupId)
                try? await groupService.fetchMessages(groupId: groupId)
                try? await groupService.fetchLeaderboard(groupId: groupId)
            }
        }
    }

    private var chatSection: some View {
        VStack {
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
            }

            Divider()

            HStack {
                TextField("Message...", text: $messageText)
                    .textFieldStyle(.roundedBorder)
                Button {
                    Task {
                        try? await groupService.sendMessage(groupId: groupId, text: messageText)
                        messageText = ""
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                }
                .disabled(messageText.isEmpty)
            }
            .padding()
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
                    .foregroundStyle(.purple)
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
