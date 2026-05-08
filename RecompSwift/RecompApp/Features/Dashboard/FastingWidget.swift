import SwiftUI
import SwiftData
import RefactorKit

struct FastingWidget: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Query(filter: #Predicate<FastingSession> { $0.endTime == nil },
           sort: \FastingSession.startTime, order: .reverse)
    private var activeSessions: [FastingSession]

    private var activeSession: FastingSession? { activeSessions.first }
    @State private var saveError: String?

    var body: some View {
        GroupBox {
            VStack(spacing: 8) {
                if let session = activeSession {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        VStack(spacing: 4) {
                            ZStack {
                                Circle()
                                    .stroke(Color.appSlate.opacity(0.2), lineWidth: 5)
                                Circle()
                                    .trim(from: 0, to: session.progress)
                                    .stroke(Color.appSlate, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                                    .rotationEffect(.degrees(-90))
                                VStack(spacing: 0) {
                                    Text(String(format: "%.1f", session.elapsedHours))
                                        .font(.caption.weight(.bold))
                                    Text("hrs")
                                        .font(.system(size: 8))
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .frame(width: 50, height: 50)

                            Text(session.currentPhase.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(.caption2)
                                .foregroundStyle(Color.appSlate)
                        }
                    }

                    Button("End Fast") {
                        session.endTime = .now
                        do { try context.save() } catch { saveError = error.localizedDescription }
                        Task { await syncEngine?.markDirty() }
                    }
                    .font(.caption2.weight(.medium))
                    .buttonStyle(.bordered)
                    .tint(Color.appSlate)
                } else {
                    Image(systemName: "timer")
                        .font(.title3)
                        .foregroundStyle(Color.appSlate)
                        .padding(.bottom, 4)

                    Button("Start Fast") {
                        let session = FastingSession()
                        context.insert(session)
                        do { try context.save() } catch { saveError = error.localizedDescription }
                        Task { await syncEngine?.markDirty() }
                    }
                    .font(.caption2.weight(.medium))
                    .buttonStyle(.borderedProminent)
                    .tint(Color.appSlate)
                }
            }
        } label: {
            Label("Fasting", systemImage: "timer")
                .font(.caption.weight(.medium))
        }
        .alert("Save Failed", isPresented: Binding(
            get: { saveError != nil },
            set: { if !$0 { saveError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(saveError ?? "")
        }
    }
}
