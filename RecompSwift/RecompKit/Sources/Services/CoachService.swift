import Foundation
import SwiftData
import Observation

@MainActor
@Observable
public final class CoachService {
    private(set) var messages: [CoachMessage] = []
    private(set) var isResponding = false

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func loadHistory(context: ModelContext) {
        let descriptor = FetchDescriptor<CoachMessage>(
            sortBy: [SortDescriptor(\.timestamp)]
        )
        messages = (try? context.fetch(descriptor)) ?? []
    }

    public func sendMessage(_ text: String, context: ModelContext) async throws {
        let userMessage = CoachMessage(role: .user, content: text)
        context.insert(userMessage)
        messages.append(userMessage)

        isResponding = true
        defer { isResponding = false }

        let historyDTOs = messages.map { msg in
            CoachMessageDTO(
                role: msg.role == .user ? "user" : "assistant",
                content: msg.content,
                at: ISO8601DateFormatter().string(from: msg.timestamp)
            )
        }

        let response: CoachChatResponse = try await api.request(
            CoachAPI.chat(message: text, history: historyDTOs)
        )

        let assistantMessage = CoachMessage(role: .assistant, content: response.reply)
        context.insert(assistantMessage)
        messages.append(assistantMessage)

        try? context.save()
    }

    public func clearHistory(context: ModelContext) {
        for message in messages {
            context.delete(message)
        }
        messages.removeAll()
        try? context.save()
    }
}
