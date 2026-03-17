import Foundation

struct ParsedFood: Sendable {
    let name: String
    let quantity: Double?
    let unit: String?
}

enum FoodQuantityParser {
    static func parse(_ input: String) -> ParsedFood {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)

        let pattern = #"^(\d+\.?\d*)\s*(oz|g|ml|cup|cups|tbsp|tsp|slice|slices|piece|pieces|serving|servings)?\s*(?:of\s+)?(.+)$"#
        if let match = trimmed.range(of: pattern, options: .regularExpression) {
            let matched = String(trimmed[match])
            let components = matched.components(separatedBy: .whitespaces).filter { !$0.isEmpty }

            if components.count >= 2, let qty = Double(components[0]) {
                let units = ["oz", "g", "ml", "cup", "cups", "tbsp", "tsp", "slice", "slices", "piece", "pieces", "serving", "servings"]
                if units.contains(components[1].lowercased()) {
                    let name = components.dropFirst(2)
                        .joined(separator: " ")
                        .replacingOccurrences(of: "of ", with: "")
                    return ParsedFood(name: name.isEmpty ? trimmed : name, quantity: qty, unit: components[1])
                } else {
                    let name = components.dropFirst(1).joined(separator: " ")
                    return ParsedFood(name: name, quantity: qty, unit: nil)
                }
            }
        }

        return ParsedFood(name: trimmed, quantity: nil, unit: nil)
    }
}
