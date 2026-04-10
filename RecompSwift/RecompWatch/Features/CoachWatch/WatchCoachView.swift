import SwiftUI

struct WatchCoachView: View {
    @State private var latestNudge = "How's your energy today? Remember to stay hydrated!"
    @State private var showReply = false

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: "bubble.left.and.text.bubble.right.fill")
                    .font(.title3)
                    .foregroundStyle(
                        LinearGradient(colors: [.blue, .purple], startPoint: .top, endPoint: .bottom)
                    )

                Text("Reco Says")
                    .font(.caption.weight(.semibold))

                Text(latestNudge)
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)

                Button {
                    showReply = true
                } label: {
                    Label("Reply", systemImage: "mic")
                        .font(.caption2)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
        }
    }
}
