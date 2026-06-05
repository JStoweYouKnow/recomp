import SwiftUI

struct DailyQuestsCard: View {
    @State private var quests: [(String, Bool)] = [
        ("Log 3 meals", false),
        ("Hit protein target", false),
        ("Drink 2L water", false),
        ("Complete workout", false),
    ]

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(quests.indices, id: \.self) { i in
                    HStack(spacing: 8) {
                        Image(systemName: quests[i].1 ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(quests[i].1 ? Color.appSuccess : Color.secondary)
                            .font(.caption)

                        Text(quests[i].0)
                            .font(.caption)
                            .strikethrough(quests[i].1)
                            .foregroundStyle(quests[i].1 ? .secondary : .primary)
                    }
                    .onTapGesture {
                        withAnimation { quests[i] = (quests[i].0, !quests[i].1) }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityValue(quests[i].1 ? "Completed" : "Not completed")
                }
            }
        } label: {
            Label("Daily Quests", systemImage: "star")
                .font(.caption.weight(.medium))
        }
    }
}
