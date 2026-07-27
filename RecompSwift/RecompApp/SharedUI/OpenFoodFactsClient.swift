import Foundation
import RefactorKit

/// Resolves a scanned barcode to a product name and per-100g macros via the free, public
/// Open Food Facts database. No API key required.
enum OpenFoodFactsClient {
    struct Product {
        let name: String
        /// Macros per 100 g of product.
        let macrosPer100g: Macros
    }

    static func lookup(barcode: String) async -> Product? {
        let trimmed = barcode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let url = URL(string: "https://world.openfoodfacts.org/api/v2/product/\(trimmed).json?fields=product_name,nutriments")
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
        return Product(name: (name?.isEmpty == false ? name! : "Scanned item"), macrosPer100g: macros)
    }

    // MARK: - Wire types

    private struct Response: Decodable {
        let status: Int
        let product: OFFProduct?
    }

    private struct OFFProduct: Decodable {
        let productName: String?
        let nutriments: Nutriments?
        enum CodingKeys: String, CodingKey {
            case productName = "product_name"
            case nutriments
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
}
