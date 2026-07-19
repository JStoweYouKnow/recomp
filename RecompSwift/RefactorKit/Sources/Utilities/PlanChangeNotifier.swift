import Foundation

public enum PlanChangeNotifier {
    public static func postLocalPlanChanged() {
        NotificationCenter.default.post(name: .recompPlanDidChange, object: nil)
    }
}
