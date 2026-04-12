import SwiftUI
import RefactorKit

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
        ScrollView {
            VStack(spacing: 28) {
                VStack(spacing: 8) {
                    Image(systemName: "figure.run")
                        .font(.system(size: 56))
                        .foregroundStyle(
                            LinearGradient(colors: [.blue, .purple], startPoint: .top, endPoint: .bottom)
                        )
                        .padding(.top, 24)

                    Text("Refactor")
                        .font(.largeTitle.weight(.bold))

                    Text("AI-powered body recomposition")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)

                VStack(spacing: 12) {
                    Button {
                        mode = .login
                    } label: {
                        Text("Log in")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .accessibilityIdentifier("onboarding_log_in")

                    Text("Email and password you use on the web")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 8)

                    Button {
                        mode = .signUp
                    } label: {
                        Text("Create an account")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)

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
                            Text("Try demo without signing in")
                                .font(.subheadline)
                        }
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
            }
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
                Button {
                    errorMessage = nil
                    Task {
                        do {
                            try await auth.login(email: email, password: password)
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                    }
                } label: {
                    if auth.isLoading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    } else {
                        Text("Log In")
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(email.isEmpty || password.isEmpty || auth.isLoading)
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
