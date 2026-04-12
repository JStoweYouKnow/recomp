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
                                    Text("Reco is thinking...")
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
            .navigationTitle("Reco Coach")
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
                    .foregroundStyle(.blue)
            }

            TextField("Ask Reco anything...", text: $messageText, axis: .vertical)
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
                    .foregroundStyle(messageText.isEmpty ? .gray : .blue)
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
                    .font(.body)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(isUser ? .blue : Color(.systemGray5))
                    .foregroundStyle(isUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if !isUser { Spacer(minLength: 60) }
        }
    }
}
