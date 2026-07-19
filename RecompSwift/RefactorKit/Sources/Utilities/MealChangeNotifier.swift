import Foundation

public enum MealChangeNotifier {
    /// Notify dashboard, widgets, and watch snapshot publishers that local meal rows changed.
    public static func postLocalMealsChanged() {
        NotificationCenter.default.post(name: .recompMealsDidChange, object: nil)
    }
}
