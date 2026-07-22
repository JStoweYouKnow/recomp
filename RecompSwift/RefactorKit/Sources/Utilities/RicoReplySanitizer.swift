import Foundation

/// Removes temporary meal-logging debug markup from Rico replies (e.g. `[DIAG today=…]` blocks).
enum RicoReplySanitizer {
    private static let diagnosticBlockPattern =
        #"\[DIAG[\s\S]*?\]"#

    static func stripDiagnosticMarkup(_ text: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: diagnosticBlockPattern, options: [.caseInsensitive]) else {
            return text
        }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let stripped = regex.stringByReplacingMatches(in: text, options: [], range: range, withTemplate: "")
        return stripped
            .replacingOccurrences(of: "\n\n\n", with: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
