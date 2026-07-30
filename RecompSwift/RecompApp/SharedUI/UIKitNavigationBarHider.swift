import SwiftUI
import UIKit

/// Hides the enclosing UIKit `UINavigationController` bar (TabView "More")
/// so a SwiftUI `NavigationStack` owns the chrome without double back buttons.
struct UIKitNavigationBarHider: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        Controller()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}

    private final class Controller: UIViewController {
        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            navigationController?.setNavigationBarHidden(true, animated: animated)
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            // Restore only when leaving this More destination (back to the More list).
            // Do not restore on SwiftUI NavigationLink pushes — that reintroduces a second bar.
            if isMovingFromParent || isBeingDismissed {
                navigationController?.setNavigationBarHidden(false, animated: animated)
            }
        }
    }
}

extension View {
    /// Use on root tab destinations that live under TabView "More" and own a `NavigationStack`.
    func hidesUIKitNavigationBar() -> some View {
        background(UIKitNavigationBarHider())
    }
}
