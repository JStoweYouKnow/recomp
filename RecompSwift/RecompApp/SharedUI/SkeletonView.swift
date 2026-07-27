import SwiftUI

/// A single pulsing placeholder bar. Prefer these over a bare spinner for content that
/// loads into a known shape (text answers, insight rows) so the transition reads as the
/// real content arriving rather than a blank flash.
struct SkeletonBlock: View {
    var width: CGFloat? = nil
    var height: CGFloat = 12
    var cornerRadius: CGFloat = 6

    @State private var pulse = false

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.primary.opacity(pulse ? 0.12 : 0.05))
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                    pulse = true
                }
            }
            .accessibilityHidden(true)
    }
}

/// A multi-line text skeleton. The final line is shortened so it reads like a paragraph.
struct TextSkeleton: View {
    var lines: Int = 3
    var spacing: CGFloat = 10

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(0..<max(lines, 1), id: \.self) { index in
                SkeletonBlock(width: index == lines - 1 ? 160 : nil)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Loading")
    }
}
