import Foundation

#if canImport(UIKit)
import UIKit

public enum ImageResizer {
    public static let maxDimension: CGFloat = 2048
    public static let maxFileSize: Int = 4 * 1024 * 1024
    public static let avatarSize: CGFloat = 160

    public static func resizeForAPI(_ image: UIImage) -> Data? {
        let resized = resize(image, maxDimension: maxDimension)
        return compress(resized, maxSize: maxFileSize)
    }

    public static func resizeForAvatar(_ image: UIImage) -> Data? {
        let resized = resize(image, maxDimension: avatarSize)
        return compress(resized, maxSize: 100_000)
    }

    private static func resize(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size
        guard max(size.width, size.height) > maxDimension else { return image }

        let scale: CGFloat
        if size.width > size.height {
            scale = maxDimension / size.width
        } else {
            scale = maxDimension / size.height
        }

        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    private static func compress(_ image: UIImage, maxSize: Int) -> Data? {
        var quality: CGFloat = 0.85
        while quality > 0.1 {
            if let data = image.jpegData(compressionQuality: quality),
               data.count <= maxSize {
                return data
            }
            quality -= 0.1
        }
        return image.jpegData(compressionQuality: 0.1)
    }
}
#endif
