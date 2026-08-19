import Foundation
import RefactorKit

/// Resolves a scanned barcode to a product name and macros via the free, public
/// Open Food Facts database. No API key required.
enum OpenFoodFactsClient {
    /// A portion the user can pick instead of doing per-100g arithmetic at the shelf.
    struct Portion: Identifiable, Hashable {
        /// The label is unique within a product's portion list, so it doubles as identity —
        /// a fresh UUID per rebuild would break `Picker` selection.
        var id: String { label }
        /// e.g. "1 serving (30 g)", "100 g", "Whole package (250 g)".
        let label: String
        let macros: Macros

        static func == (lhs: Portion, rhs: Portion) -> Bool { lhs.label == rhs.label }

        func hash(into hasher: inout Hasher) { hasher.combine(label) }
    }

    struct Product {
        let name: String
        /// Macros per 100 g of product.
        let macrosPer100g: Macros
        /// Grams in one manufacturer serving, when the product declares one.
        let servingSizeGrams: Double?
        /// Human-readable serving text straight from the label, e.g. "30 g (about 12 chips)".
        let servingSizeText: String?
        /// Grams in the whole package, when declared.
        let packageGrams: Double?

        /// Selectable portions, best-first. The declared serving leads because that is how
        /// people think about food; per-100g stays available for scale users.
        var portions: [Portion] {
            var result: [Portion] = []

            if let grams = servingSizeGrams, grams > 0 {
                let detail = servingSizeText.map { " — \($0)" } ?? ""
                result.append(
                    Portion(
                        label: "1 serving (\(Self.gramsLabel(grams)))\(detail)",
                        macros: Self.scale(macrosPer100g, byGrams: grams)
                    )
                )
            }

            result.append(Portion(label: "100 g", macros: macrosPer100g))

            if let pkg = packageGrams, pkg > 0, pkg != servingSizeGrams {
                result.append(
                    Portion(
                        label: "Whole package (\(Self.gramsLabel(pkg)))",
                        macros: Self.scale(macrosPer100g, byGrams: pkg)
                    )
                )
            }

            return result
        }

        /// The portion to preselect — the label's own serving when it has one.
        var defaultPortion: Portion? { portions.first }

        private static func gramsLabel(_ grams: Double) -> String {
            grams.truncatingRemainder(dividingBy: 1) == 0
                ? "\(Int(grams)) g"
                : String(format: "%.1f g", grams)
        }

        private static func scale(_ per100g: Macros, byGrams grams: Double) -> Macros {
            let factor = grams / 100
            return Macros(
                calories: Int((Double(per100g.calories) * factor).rounded()),
                protein: ((per100g.protein * factor) * 10).rounded() / 10,
                carbs: ((per100g.carbs * factor) * 10).rounded() / 10,
                fat: ((per100g.fat * factor) * 10).rounded() / 10
            )
        }
    }

    static func lookup(barcode: String) async -> Product? {
        let trimmed = barcode.trimmingCharacters(in: .whitespacesAndNewlines)
        let fields = "product_name,nutriments,serving_size,serving_quantity,product_quantity"
        guard !trimmed.isEmpty,
              let url = URL(string: "https://world.openfoodfacts.org/api/v2/product/\(trimmed).json?fields=\(fields)")
        else { return nil }

        var request = URLRequest(url: url)
        request.setValue("Recomp-iOS - fitness app", forHTTPHeaderField: "User-Agent")

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let root = try? JSONDecoder().decode(Response.self, from: data),
              root.status == 1,
              let product = root.product
        else { return nil }

        let n = product.nutriments
        let macros = Macros(
            calories: Int((n?.energyKcal ?? 0).rounded()),
            protein: n?.proteins ?? 0,
            carbs: n?.carbs ?? 0,
            fat: n?.fat ?? 0
        )
        guard macros.calories > 0 || macros.protein > 0 || macros.carbs > 0 || macros.fat > 0 else { return nil }

        let name = product.productName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let servingText = product.servingSize?.trimmingCharacters(in: .whitespacesAndNewlines)

        return Product(
            name: (name?.isEmpty == false ? name! : "Scanned item"),
            macrosPer100g: macros,
            servingSizeGrams: product.servingQuantity?.value,
            servingSizeText: (servingText?.isEmpty == false) ? servingText : nil,
            packageGrams: product.productQuantity?.value
        )
    }

    // MARK: - Wire types

    private struct Response: Decodable {
        let status: Int
        let product: OFFProduct?
    }

    private struct OFFProduct: Decodable {
        let productName: String?
        let nutriments: Nutriments?
        let servingSize: String?
        /// Open Food Facts is inconsistent here — sometimes a number, sometimes a string.
        let servingQuantity: LooseDouble?
        let productQuantity: LooseDouble?

        enum CodingKeys: String, CodingKey {
            case productName = "product_name"
            case nutriments
            case servingSize = "serving_size"
            case servingQuantity = "serving_quantity"
            case productQuantity = "product_quantity"
        }
    }

    private struct Nutriments: Decodable {
        let energyKcal: Double?
        let proteins: Double?
        let carbs: Double?
        let fat: Double?
        enum CodingKeys: String, CodingKey {
            case energyKcal = "energy-kcal_100g"
            case proteins = "proteins_100g"
            case carbs = "carbohydrates_100g"
            case fat = "fat_100g"
        }
    }

    /// Decodes a field that the API may send as either a JSON number or a quoted string.
    private struct LooseDouble: Decodable {
        let value: Double?

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let double = try? container.decode(Double.self) {
                value = double
            } else if let string = try? container.decode(String.self) {
                value = Double(string.trimmingCharacters(in: .whitespaces))
            } else {
                value = nil
            }
        }
    }
}
