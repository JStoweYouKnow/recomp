import SwiftUI

/// Earth-tone palette matching the Refactor web app (globals.css).
public extension Color {
    // MARK: - Primary palette

    /// Olive green — primary interactive / accent colour (#6b7c3c)
    static let appAccent       = Color(hex: "#6b7c3c")
    /// Darker olive for pressed / hover states (#5a6b2e)
    static let appAccentHover  = Color(hex: "#5a6b2e")
    /// Sage variant (#7d8c4a)
    static let appSage         = Color(hex: "#7d8c4a")
    /// Warm tan (#b8956b)
    static let appWarm         = Color(hex: "#b8956b")
    /// Terracotta (#9b7b6c)
    static let appTerracotta   = Color(hex: "#9b7b6c")
    /// Slate blue-grey (#7a8a9a)
    static let appSlate        = Color(hex: "#7a8a9a")

    // MARK: - Semantic

    /// Terracotta red for errors/destructive (#b54a32)
    static let appError        = Color(hex: "#b54a32")
    /// Olive green for success (#5a7c2e)
    static let appSuccess      = Color(hex: "#5a7c2e")

    // MARK: - Surface / background (adaptive light/dark)
    //
    // Named `recomp*` (not `app*`) so we do not collide with SwiftUI’s built-in
    // semantic `Color` statics on newer SDKs (e.g. `appBackground`, `appMuted`).

    /// Page background — cream in light, near-black in dark
    static let recompBackground = Color("AppBackground")
    /// Slightly elevated surface (cards, sheets)
    static let recompSurface = Color("AppSurface")
    /// Subtle border / separator
    static let recompBorder = Color("AppBorder")
    /// Primary foreground / text
    static let recompForeground = Color("AppForeground")
    /// Secondary / muted text
    static let recompMuted = Color("AppMuted")
}

// MARK: - Gradient helpers

public extension LinearGradient {
    /// Primary olive gradient used for progress fills, buttons.
    static let appAccentGradient = LinearGradient(
        colors: [Color.appSage, Color.appAccent],
        startPoint: .leading,
        endPoint: .trailing
    )

    /// Warm terracotta gradient — used when approaching / exceeding a limit.
    static let appWarningGradient = LinearGradient(
        colors: [Color.appTerracotta, Color.appError],
        startPoint: .leading,
        endPoint: .trailing
    )
}

// MARK: - Hex initialiser

private extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >>  8) & 0xFF) / 255
        let b = Double( int        & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
