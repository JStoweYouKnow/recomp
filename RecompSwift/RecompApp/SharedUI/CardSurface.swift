import SwiftUI

/// The standard card background.
///
/// Cards used to render on `.ultraThinMaterial`, which desaturates whatever sits behind
/// it. On a mostly-neutral dashboard that turned an earth-tone palette — olive, sage,
/// tan, terracotta — into a screen of grey translucent rectangles, and it is the most
/// common way a SwiftUI app announces that it is a SwiftUI app.
///
/// `Color.recompSurface` is already adaptive for light and dark, so this keeps the brand
/// intact in both. Reserve real material for things that genuinely float *over* content:
/// the toast and the rest-timer banner.
struct CardSurface: ViewModifier {
    var cornerRadius: CGFloat = 16
    /// Optional accent for cards that need emphasis (over budget, missed session).
    var borderColor: Color? = nil
    var borderWidth: CGFloat = 1

    func body(content: Content) -> some View {
        content
            .background(Color.recompSurface, in: RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(borderColor ?? Color.recompBorder, lineWidth: borderWidth)
            )
            .shadow(color: .black.opacity(0.05), radius: 6, y: 2)
    }
}

extension View {
    /// Standard card surface: brand background, hairline border, soft lift.
    func cardSurface(
        cornerRadius: CGFloat = 16,
        borderColor: Color? = nil,
        borderWidth: CGFloat = 1
    ) -> some View {
        modifier(CardSurface(cornerRadius: cornerRadius, borderColor: borderColor, borderWidth: borderWidth))
    }
}
