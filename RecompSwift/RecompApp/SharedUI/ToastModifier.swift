import SwiftUI

extension Notification.Name {
    /// Fire a toast from anywhere (including sheets that don't inherit the environment).
    /// userInfo: `["message": String, "type": ToastType]`.
    static let recompShowToast = Notification.Name("recompShowToast")
    /// Trigger the celebratory confetti + success haptic at the root.
    static let recompCelebrate = Notification.Name("recompCelebrate")
}

/// Convenience entry point for firing a toast from imperative code without needing the
/// `ToastManager` from the environment. The root view observes `.recompShowToast`.
enum ToastCenter {
    static func show(_ message: String, type: ToastType = .info) {
        NotificationCenter.default.post(
            name: .recompShowToast,
            object: nil,
            userInfo: ["message": message, "type": type]
        )
    }

    /// Fire confetti + a success haptic at the root of the app.
    static func celebrate() {
        NotificationCenter.default.post(name: .recompCelebrate, object: nil)
    }
}

enum ToastType {
    case success, error, info

    var color: Color {
        switch self {
        case .success: return .appSuccess
        case .error: return .appError
        case .info: return .appAccent
        }
    }

    var icon: String {
        switch self {
        case .success: return "checkmark.circle.fill"
        case .error: return "xmark.circle.fill"
        case .info: return "info.circle.fill"
        }
    }
}

@Observable
final class ToastManager {
    var currentToast: ToastData?

    struct ToastData: Identifiable {
        let id = UUID()
        let message: String
        let type: ToastType
    }

    func show(_ message: String, type: ToastType = .info) {
        withAnimation(.spring(duration: 0.3)) {
            currentToast = ToastData(message: message, type: type)
        }

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            withAnimation(.spring(duration: 0.3)) {
                currentToast = nil
            }
        }
    }
}

struct ToastModifier: ViewModifier {
    @Environment(ToastManager.self) private var toastManager

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let toast = toastManager.currentToast {
                    HStack(spacing: 8) {
                        Image(systemName: toast.type.icon)
                            .foregroundStyle(toast.type.color)

                        Text(toast.message)
                            .font(.subheadline.weight(.medium))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                    .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
    }
}

extension View {
    func toastOverlay() -> some View {
        modifier(ToastModifier())
    }
}
