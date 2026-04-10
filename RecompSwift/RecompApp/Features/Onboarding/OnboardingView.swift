import SwiftUI

struct OnboardingView: View {
    @Environment(AuthService.self) private var auth
    @State private var mode: OnboardingMode = .choose

    enum OnboardingMode {
        case choose, signUp, login
    }

    var body: some View {
        NavigationStack {
            switch mode {
            case .choose:
                ChooseView(mode: $mode)
            case .signUp:
                SignUpFormView(onBack: { mode = .choose })
            case .login:
                LoginView(onBack: { mode = .choose })
            }
        }
    }
}

private struct ChooseView: View {
    @Environment(AuthService.self) private var auth
    @Binding var mode: OnboardingView.OnboardingMode
    @State private var isLoadingDemo = false

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 8) {
                Image(systemName: "figure.run")
                    .font(.system(size: 64))
                    .foregroundStyle(
                        LinearGradient(colors: [.blue, .purple], startPoint: .top, endPoint: .bottom)
                    )

                Text("Recomp")
                    .font(.largeTitle.weight(.bold))

                Text("AI-powered body recomposition")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(spacing: 12) {
                Button {
                    mode = .signUp
                } label: {
                    Text("Get Started")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button {
                    mode = .login
                } label: {
                    Text("I have an account")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.bordered)

                Button {
                    Task {
                        isLoadingDemo = true
                        try? await auth.loadDemo()
                        isLoadingDemo = false
                    }
                } label: {
                    if isLoadingDemo {
                        ProgressView()
                    } else {
                        Text("Try Demo")
                            .font(.subheadline)
                    }
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
    }
}

private struct LoginView: View {
    @Environment(AuthService.self) private var auth
    let onBack: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)

                SecureField("Password", text: $password)
                    .textContentType(.password)
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            Section {
                Button("Log In") {
                    Task {
                        do {
                            try await auth.login(email: email, password: password)
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                    }
                }
                .disabled(email.isEmpty || password.isEmpty)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Log In")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Back", action: onBack)
            }
        }
    }
}
