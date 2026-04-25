import SwiftUI
import WebKit

/// Renders an animated GIF using WKWebView so frames animate correctly.
/// Loads the URL directly via WKWebView's own request pipeline, which handles
/// caching, redirects, and Content-Type correctly for GIFs.
/// The Coordinator guard ensures the HTML is only (re)loaded when the URL changes,
/// preventing WKWebView from restarting mid-load on every SwiftUI re-render.
struct AnimatedGIFView: View {
    let url: URL
    var cornerRadius: CGFloat = 10
    var maxHeight: CGFloat = 220

    var body: some View {
        _GIFWebView(url: url)
            .frame(maxWidth: .infinity, maxHeight: maxHeight)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
}

private struct _GIFWebView: UIViewRepresentable {
    let url: URL

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedURL: URL?
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
        // Only reload when the URL actually changes — prevents interrupting an
        // in-progress load every time SwiftUI re-renders the parent (e.g. set taps).
        guard context.coordinator.loadedURL != url else { return }
        context.coordinator.loadedURL = url

        let escaped = url.absoluteString
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "\"", with: "&quot;")
        let html = """
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#000; display:flex; align-items:center; justify-content:center; height:100vh; }
        img { max-width:100%; max-height:100%; object-fit:contain; border-radius:10px; }
        </style></head>
        <body><img src="\(escaped)"></body></html>
        """
        // Use the GIF's origin as baseURL so WKWebView shares its cookie/credential store
        // for the request and ATS evaluates the correct hostname.
        let base = URL(string: "\(url.scheme ?? "https")://\(url.host ?? "")")
        wv.loadHTMLString(html, baseURL: base)
    }
}
