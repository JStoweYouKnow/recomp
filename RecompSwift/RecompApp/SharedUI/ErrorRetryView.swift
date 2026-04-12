import SwiftUI

struct ErrorRetryView: View {
    let error: Error
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundStyle(.orange)

            Text("Something went wrong")
                .font(.headline)

            Text(error.localizedDescription)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button("Try Again", action: retry)
                .buttonStyle(.borderedProminent)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
