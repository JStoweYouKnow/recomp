import SwiftUI
import SwiftData
import RefactorKit

struct WatchCoachView: View {
    @Environment(\.modelContext) private var context

    @Query(sort: \CoachMessage.timestamp, order: .forward)
    private var coachMessages: [CoachMessage]

    private var lastAssistantText: String? {
        coachMessages.reversed().first { $0.role == .assistant }?.content
    }

    private var ricoFallbackText: String? {
        guard let data = RecompAppGroupDefaults.shared.data(forKey: RecompUserDefaultsKeys.ricoHistoryJSON),
              let rico = try? JSONDecoder().decode([RicoMessageDTO].self, from: data),
              let last = rico.reversed().first(where: { $0.role == "assistant" })
        else { return nil }
        return last.content
    }

    private var displayText: String {
        if let t = lastAssistantText, !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return t
        }
        if let t = ricoFallbackText, !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return t
        }
        return "Chat with Ref on your iPhone. After sync, the latest tip appears here."
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: "bubble.left.and.text.bubble.right.fill")
                    .font(.title3)
                    .foregroundStyle(
                        LinearGradient(colors: [.blue, .purple], startPoint: .top, endPoint: .bottom)
                    )

                Text("Ref")
                    .font(.caption.weight(.semibold))

                Text(displayText)
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
    }
}
