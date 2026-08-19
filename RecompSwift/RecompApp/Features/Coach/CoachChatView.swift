import SwiftUI
import SwiftData
import RefactorKit

struct CoachChatView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(\.syncEngine) private var syncEngine
    @Environment(AuthService.self) private var auth
    @State private var coachService = CoachService()
    @State private var planService = PlanService()
    @State private var messageText = ""
    @State private var scrollProxy: ScrollViewProxy?
    @State private var sendError: String?
    @State private var isRegeneratingPlan = false
    @State private var speechTranscription = MealSpeechTranscription()
    @FocusState private var isInputFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(coachService.messages, id: \.id) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }

                        if coachService.isResponding {
                            HStack {
                                ProgressView()
                                    .scaleEffect(0.8)
                                Text("Ref is thinking...")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding()
                }
                .scrollDismissesKeyboard(.interactively)
                .onAppear { scrollProxy = proxy }
                .onChange(of: coachService.messages.count) { _, _ in
                    if let last = coachService.messages.last {
                        withAnimation {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
            // Attached to the container rather than the inner ScrollView. Keyboard
            // avoidance is driven by the safe area of the view the inset is attached to;
            // hanging it off a ScrollView nested inside a ScrollViewReader is the fragile
            // placement that lets the bar end up behind the keyboard.
            .safeAreaInset(edge: .bottom) {
                inputBar
            }
            .navigationTitle("Ref")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Clear History", role: .destructive) {
                            coachService.clearHistory(context: context)
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Chat options")
                }
                // Keep this. Removing it to stop the "Done" pill covering the send button
                // regressed something worse: without a keyboard accessory in the responder
                // chain, the bottom input bar ended up *behind* the keyboard, so you could
                // not read what you were typing. The covered button is the lesser bug.
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { isInputFocused = false }
                }
            }
            .onAppear {
                coachService.loadHistory(context: context)
            }
            .alert("Ref couldn't respond", isPresented: Binding(
                get: { sendError != nil },
                set: { if !$0 { sendError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(sendError ?? "")
            }
            .overlay {
                if isRegeneratingPlan || planService.isGenerating {
                    ZStack {
                        Color.black.opacity(0.35).ignoresSafeArea()
                        VStack(spacing: 12) {
                            ProgressView()
                            Text("Building your new plan…")
                                .font(.subheadline.weight(.medium))
                            Text("This can take up to a minute.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(24)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                    }
                }
            }
        }
    }

    private var inputBar: some View {
        VStack(spacing: 4) {
            Divider()

            if let micError = speechTranscription.errorMessage {
                Text(micError)
                    .font(.caption)
                    .foregroundStyle(Color.appError)
                    .padding(.horizontal)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            HStack(spacing: 12) {
                Button {
                    if speechTranscription.isRecording {
                        speechTranscription.stopRecording()
                    } else {
                        Task { await speechTranscription.startRecording() }
                    }
                } label: {
                    Image(systemName: speechTranscription.isRecording ? "stop.circle.fill" : "mic.fill")
                        .font(.title3)
                        .foregroundStyle(speechTranscription.isRecording ? Color.appError : Color.appAccent)
                        .symbolEffect(.pulse, isActive: speechTranscription.isRecording)
                }
                .accessibilityLabel(speechTranscription.isRecording ? "Stop recording" : "Start voice input")
                .onChange(of: speechTranscription.isRecording) { wasRecording, isNowRecording in
                    if wasRecording && !isNowRecording {
                        let transcript = speechTranscription.transcript
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                        if !transcript.isEmpty {
                            messageText = transcript
                        }
                    }
                }

                TextField("Ask Ref anything...", text: $messageText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(4)
                    .focused($isInputFocused)

                Button {
                    let text = messageText
                    messageText = ""
                    isInputFocused = false
                    Task {
                        do {
                            try await coachService.sendMessage(text, context: context)
                            if coachService.shouldRegeneratePlan {
                                isRegeneratingPlan = true
                                defer { isRegeneratingPlan = false }
                                _ = try await planService.regeneratePlan(
                                    context: context,
                                    options: coachService.pendingRegenerateOptions
                                )
                            }
                            await syncEngine?.markDirty()
                            _ = await syncEngine?.syncNow()
                            try? await syncEngine?.fetchAndApply()
                            auth.refreshCurrentUserFromStore()
                        } catch {
                            sendError =
                                (error as? LocalizedError)?.errorDescription
                                ?? (error as? APIError)?.errorDescription
                                ?? error.localizedDescription
                            messageText = text
                        }
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(messageText.isEmpty ? Color.recompMuted : Color.appAccent)
                }
                .accessibilityLabel("Send message")
                .disabled(messageText.isEmpty || coachService.isResponding)
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
        .background(.regularMaterial)
    }
}

struct MessageBubble: View {
    let message: CoachMessage
    private var isUser: Bool { message.role == .user }

    var body: some View {
        HStack {
            if isUser { Spacer(minLength: 60) }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .font(Font.body)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(isUser ? Color.appAccent : Color.recompSurface)
                    .foregroundStyle(isUser ? Color.white : Color.recompForeground)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if !isUser { Spacer(minLength: 60) }
        }
    }
}
