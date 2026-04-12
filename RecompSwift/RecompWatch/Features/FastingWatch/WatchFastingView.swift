import SwiftUI
import SwiftData
import RefactorKit

struct WatchFastingView: View {
    @Environment(\.modelContext) private var context
    @Query(filter: #Predicate<FastingSession> { $0.endTime == nil },
           sort: \FastingSession.startTime, order: .reverse)
    private var activeSessions: [FastingSession]

    private var session: FastingSession? { activeSessions.first }

    var body: some View {
        VStack(spacing: 12) {
            Label("Fasting", systemImage: "timer")
                .font(.caption.weight(.semibold))

            if let session {
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    ZStack {
                        Circle()
                            .stroke(.purple.opacity(0.2), lineWidth: 6)
                        Circle()
                            .trim(from: 0, to: session.progress)
                            .stroke(.purple, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                        VStack(spacing: 0) {
                            Text(String(format: "%.1f", session.elapsedHours))
                                .font(.system(.body, design: .rounded, weight: .bold))
                            Text("/ \(session.targetHours)h")
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(width: 80, height: 80)
                }

                Button("End Fast") {
                    session.endTime = .now
                    try? context.save()
                }
                .font(.caption2)
                .buttonStyle(.bordered)
                .tint(.purple)
            } else {
                Text("Not fasting")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button("Start 16:8") {
                    let newSession = FastingSession(targetHours: 16)
                    context.insert(newSession)
                }
                .font(.caption2)
                .buttonStyle(.borderedProminent)
                .tint(.purple)
            }
        }
        .padding()
    }
}
