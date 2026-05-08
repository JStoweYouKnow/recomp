import SwiftUI
import WebKit

/// Renders an animated GIF from pre-fetched Data using WKWebView.
/// The GIF bytes are embedded as a base64 data URL so the webview makes no
/// outbound network request — avoiding the auth-header gap that blocked
/// server-proxied GIF endpoints from loading via a plain <img> src URL.
struct AnimatedGIFView: View {
    let data: Data
    var cornerRadius: CGFloat = 10
    var maxHeight: CGFloat = 220

    var body: some View {
        _GIFWebView(data: data)
            .frame(maxWidth: .infinity, maxHeight: maxHeight)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
}

private struct _GIFWebView: UIViewRepresentable {
    let data: Data

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedHash: Int?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.isOpaque = false
        wv.backgroundColor = .clear
        wv.scrollView.isScrollEnabled = false
        wv.scrollView.bounces = false
        wv.navigationDelegate = context.coordinator
        return wv
    }

    func updateUIView(_ wv: WKWebView, context: Context) {
        // Avoid reloading on every SwiftUI re-render (e.g. when a set is tapped).
        guard context.coordinator.loadedHash != data.hashValue else { return }
        context.coordinator.loadedHash = data.hashValue

        let base64 = data.base64EncodedString()
        let mimeType = detectedMimeType(for: data)
        let html = """
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#000; display:flex; align-items:center; justify-content:center; height:100vh; }
        img { max-width:100%; max-height:100%; object-fit:contain; border-radius:10px; }
        </style></head>
        <body><img src="data:\(mimeType);base64,\(base64)"></body></html>
        """
        wv.loadHTMLString(html, baseURL: nil)
    }

    private func detectedMimeType(for data: Data) -> String {
        if data.count >= 6, let sig = String(data: data.prefix(6), encoding: .ascii),
           sig == "GIF87a" || sig == "GIF89a" {
            return "image/gif"
        }
        if data.count >= 8, Array(data.prefix(8)) == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
            return "image/png"
        }
        if data.count >= 2, data[data.startIndex] == 0xFF, data[data.index(after: data.startIndex)] == 0xD8 {
            return "image/jpeg"
        }
        if let prefix = String(data: data.prefix(256), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
           prefix.hasPrefix("<svg") || prefix.hasPrefix("<?xml") {
            return "image/svg+xml"
        }
        return "application/octet-stream"
    }
}
