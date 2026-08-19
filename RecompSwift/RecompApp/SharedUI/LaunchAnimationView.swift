import SwiftUI

/// Branded landing screen shown while the app resolves its session and runs the first sync.
///
/// It replaces two rough edges on cold launch: the system launch screen handing off to a
/// blank view, and — because `isAuthenticated` starts `false` while `checkSession()` is
/// still in flight — a flash of the login screen before a signed-in user's data appears.
///
/// The animation is a loading state, not a delay. It stays only as long as the work behind
/// it, plus a short floor so a fast launch doesn't strobe.
struct LaunchAnimationView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Drives the plate's rotation. Held separately from the entrance animation so the
    /// repeating spin never fights the exit transition.
    @State private var sweeping = false
    @State private var markVisible = false
    @State private var wordmarkVisible = false

    var body: some View {
        ZStack {
            Color.recompBackground
                .ignoresSafeArea()

            VStack(spacing: 22) {
                mark
                wordmark
            }
            .padding(.bottom, 40)
        }
        .onAppear(perform: startAnimating)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Refactor is starting")
        .accessibilityAddTraits(.updatesFrequently)
    }

    // MARK: - Mark

    /// The app icon's weight plate, cropped to its rim and rotating.
    ///
    /// The plate is the brand mark, and spinning it *is* the loading indicator — no
    /// separate spinner competing with it. `LaunchMark` is a standalone imageset rather
    /// than the `AppIcon` asset because app icon assets can't be loaded at runtime.
    private var mark: some View {
        Image("LaunchMark")
            .resizable()
            .scaledToFit()
            .frame(width: 100, height: 100)
            .rotationEffect(.degrees(sweeping ? 360 : 0))
            .scaleEffect(markVisible ? 1 : (reduceMotion ? 1 : 0.82))
            .opacity(markVisible ? 1 : 0)
            .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
    }

    private var wordmark: some View {
        VStack(spacing: 6) {
            Text("Refactor")
                .font(.title2.weight(.bold))
                .foregroundStyle(Color.recompForeground)
            Text("AI-powered body recomposition")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .opacity(wordmarkVisible ? 1 : 0)
        .offset(y: wordmarkVisible ? 0 : (reduceMotion ? 0 : 8))
    }

    // MARK: - Animation

    private func startAnimating() {
        guard !markVisible else { return }

        if reduceMotion {
            withAnimation(.easeOut(duration: 0.25)) {
                markVisible = true
                wordmarkVisible = true
            }
            return
        }

        withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
            markVisible = true
        }
        withAnimation(.easeOut(duration: 0.4).delay(0.15)) {
            wordmarkVisible = true
        }
        // Slow enough to read as a plate turning rather than a spinner thrashing.
        withAnimation(.linear(duration: 2.8).repeatForever(autoreverses: false)) {
            sweeping = true
        }
    }
}

/// Tracks how long the landing screen has been up so it can be held to a minimum.
///
/// Without a floor, a warm launch dismisses it after ~50 ms, which reads as a glitch
/// rather than a transition. With one, a slow launch is never made slower — the floor
/// only ever pads a launch that finished early.
enum LaunchTiming {
    static let minimumOnScreen: Duration = .milliseconds(850)

    /// Sleeps for whatever is left of the floor, given when the launch screen appeared.
    static func waitOutRemainder(since start: Date) async {
        let elapsed = Date.now.timeIntervalSince(start)
        let floor = Double(minimumOnScreen.components.seconds)
            + Double(minimumOnScreen.components.attoseconds) / 1e18
        let remaining = floor - elapsed
        guard remaining > 0 else { return }
        try? await Task.sleep(for: .seconds(remaining))
    }
}
