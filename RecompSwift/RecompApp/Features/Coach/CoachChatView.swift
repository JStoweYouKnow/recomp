import SwiftUI
import SwiftData
import RefactorKit

struct CoachChatView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var coachService = CoachService()
    @State private var messageText = ""
    @State private var scrollProxy: ScrollViewProxy?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
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
                    .onAppear {
                        scrollProxy = proxy
                    }
                    .onChange(of: coachService.messages.count) {
                        if let last = coachService.messages.last {
                            withAnimation {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }

                Divider()

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
                }
            }
            .onAppear {
                coachService.loadHistory(context: context)
            }
        }
    }

    private var inputBar: some View {
        HStack(spacing: 12) {
            Button {
                // Voice input
            } label: {
                Image(systemName: "mic.fill")
                    .font(.title3)
                    .foregroundStyle(Color.appAccent)
            }

            TextField("Ask Ref anything...", text: $messageText, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(4)

            Button {
                let text = messageText
                messageText = ""
                Task {
                    try? await coachService.sendMessage(text, context: context)
                }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundStyle(messageText.isEmpty ? Color.recompMuted : Color.appAccent)
            }
            .disabled(messageText.isEmpty || coachService.isResponding)
        }
        .padding()
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
