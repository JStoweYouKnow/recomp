import Foundation

/// Converts between the user's chosen entry unit and the pounds that every set log,
/// progression calculation, and personal record is stored in.
///
/// Storage stays in pounds unconditionally — `Progression`, `PersonalRecordStore` and
/// the server all assume it. Only what the user types and reads is converted, so a
/// metric lifter's numbers stay comparable with their own history and with the web app.
public enum MassUnit: String, Sendable {
    case pounds
    case kilograms

    public init(system: MeasurementSystem) {
        self = system == .metric ? .kilograms : .pounds
    }

    public var label: String {
        switch self {
        case .pounds: return "lbs"
        case .kilograms: return "kg"
        }
    }

    /// Convert a value the user typed into stored pounds.
    public func toPounds(_ value: Double) -> Double {
        switch self {
        case .pounds: return value
        case .kilograms: return value / WearableMassStoredPounds.lbsToKg
        }
    }

    /// Convert stored pounds into the unit the user reads.
    public func fromPounds(_ pounds: Double) -> Double {
        switch self {
        case .pounds: return pounds
        case .kilograms: return pounds * WearableMassStoredPounds.lbsToKg
        }
    }

    /// Display string with at most one decimal place, trimming a trailing `.0`.
    public func display(fromPounds pounds: Double) -> String {
        Self.trimmed(fromPounds(pounds))
    }

    public static func trimmed(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        return rounded.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(rounded))
            : String(format: "%.1f", rounded)
    }
}
