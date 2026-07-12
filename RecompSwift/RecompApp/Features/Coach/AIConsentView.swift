import SwiftUI

struct AIConsentView: View {
    let onAccept: () -> Void
    let onDecline: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("AI-Powered Features", systemImage: "brain.head.profile")
                            .font(.title2.weight(.bold))

                        Text("Your permission is required before Refactor can share your data with a third-party AI service.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 16) {
                        disclosureRow(
                            icon: "person.text.rectangle",
                            title: "What data is shared",
                            body: "Your profile (age, weight, height, fitness goals), meal logs, workout history, biofeedback entries, supplement names and dosages, and any lab result photos you upload."
                        )

                        disclosureRow(
                            icon: "building.2",
                            title: "Who receives your data",
                            body: "Your data is sent to Amazon Web Services (AWS Bedrock), which powers the AI models used by Refactor. AWS processes your data to generate responses and does not use it to train AI models."
                        )

                        disclosureRow(
                            icon: "lock.shield",
                            title: "How it is protected",
                            body: "Data is transmitted over encrypted connections (TLS). AWS Bedrock operates under AWS's privacy and security standards. No data is sold to third parties."
                        )

                        disclosureRow(
                            icon: "hand.raised",
                            title: "Your control",
                            body: "You can revoke this permission at any time in Profile → Settings → Revoke AI Access. Revoking will not affect access to other app features."
                        )
                    }

                    Link("View Privacy Policy", destination: URL(string: "https://refactoryourbody.com/privacy")!)
                        .font(.subheadline)

                    VStack(spacing: 12) {
                        Text("By tapping Allow, you give Refactor permission to send the above data to Amazon Web Services (AWS Bedrock) to generate personalised AI responses.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)

                        Button {
                            onAccept()
                        } label: {
                            Text("Allow & Enable AI Features")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .frame(height: 52)
                                .background(Color.appAccent)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }

                        Button(role: .cancel) {
                            onDecline()
                        } label: {
                            Text("No Thanks")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.top, 8)
                }
                .padding(24)
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func disclosureRow(icon: String, title: String, body: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.appAccent)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(body)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
