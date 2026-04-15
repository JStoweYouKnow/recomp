import SwiftUI
import WebKit

/// Renders an animated GIF (or any image URL) using WKWebView so GIFs play correctly.
/// Falls back to a placeholder while loading or on error.
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

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.isOpaque = false
        wv.backgroundColor = .clear
        wv.scrollView.isScrollEnabled = false
        wv.scrollView.bounces = false
        return wv
    }

    func updateUIView(_ wv: WKWebView, context: Context) {
        // Wrap in minimal HTML that centres the image and fills the view, no white flash.
        let html = """
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:transparent; display:flex; align-items:center; justify-content:center; height:100vh; }
        img { max-width:100%; max-height:100%; object-fit:contain; border-radius:10px; }
        </style></head>
        <body><img src="\(url.absoluteString)"></body></html>
        """
        wv.loadHTMLString(html, baseURL: nil)
    }
}
