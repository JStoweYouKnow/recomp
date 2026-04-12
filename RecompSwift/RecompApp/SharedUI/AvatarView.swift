import SwiftUI
import UIKit

struct AvatarView: View {
    let dataUrl: String?
    let name: String
    var size: CGFloat = 40

    var body: some View {
        Group {
            if let dataUrl, let data = Data(base64Encoded: extractBase64(from: dataUrl)),
               let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(initials)
                    .font(.system(size: size * 0.4, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(
                        LinearGradient(
                            colors: [.blue, .purple],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var initials: String {
        let parts = name.split(separator: " ")
        let first = parts.first?.prefix(1) ?? "?"
        let last = parts.count > 1 ? parts.last!.prefix(1) : ""
        return "\(first)\(last)".uppercased()
    }

    private func extractBase64(from dataUrl: String) -> String {
        if dataUrl.contains(",") {
            return String(dataUrl.split(separator: ",").last ?? "")
        }
        return dataUrl
    }
}

#Preview {
    HStack {
        AvatarView(dataUrl: nil, name: "John Doe")
        AvatarView(dataUrl: nil, name: "Jane", size: 60)
    }
}
