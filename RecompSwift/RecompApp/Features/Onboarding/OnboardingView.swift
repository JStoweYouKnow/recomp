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
    @State private var demoError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                VStack(spacing: 8) {
                    Image(systemName: "figure.run")
                        .font(.system(size: 56))
                        .foregroundStyle(LinearGradient.appAccentGradient)
                        .padding(.top, 24)
                        .accessibilityHidden(true)

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
                    .tint(Color.appAccent)
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
                    .tint(Color.appAccent)
                    .controlSize(.large)

                    Button {
                        demoError = nil
                        Task {
                            isLoadingDemo = true
                            do {
                                try await auth.loadDemo()
                            } catch {
                                demoError = error.localizedDescription
                            }
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
                    .disabled(isLoadingDemo)
                    .padding(.top, 4)

                    if let demoError {
                        Text(demoError)
                            .font(.caption)
                            .foregroundStyle(Color.appError)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
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
    @State private var isLoggingIn = false
    @State private var showForgotPassword = false

    var body: some View {
        Form {
            Section {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()

                SecureField("Password", text: $password)
                    .textContentType(.password)
            }

            if let errorMessage {
                Section {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(Color.appError)
                            .accessibilityHidden(true)
                        Text(errorMessage)
                            .foregroundStyle(Color.appError)
                            .font(.subheadline)
                    }
                }
            }

            Section {
                Button {
                    guard !isLoggingIn else { return }
                    errorMessage = nil
                    isLoggingIn = true
                    Task {
                        do {
                            try await auth.login(email: email, password: password)
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                        isLoggingIn = false
                    }
                } label: {
                    HStack {
                        Spacer()
                        if isLoggingIn {
                            ProgressView()
                        } else {
                            Text("Log In").fontWeight(.semibold)
                        }
                        Spacer()
                    }
                }
                .disabled(email.isEmpty || password.isEmpty || isLoggingIn)
            }

            Section {
                Button("Forgot Password?") {
                    showForgotPassword = true
                }
                .font(.subheadline)
                .foregroundStyle(Color.appAccent)
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .navigationTitle("Log In")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Back", action: onBack)
                    .disabled(isLoggingIn)
            }
        }
        .interactiveDismissDisabled(isLoggingIn)
        .sheet(isPresented: $showForgotPassword) {
            ForgotPasswordView(prefillEmail: email)
        }
    }
}

private struct ForgotPasswordView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.dismiss) private var dismiss

    var prefillEmail: String = ""

    @State private var email: String
    @State private var code = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var step: Step = .requestCode
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var successMessage: String?

    enum Step { case requestCode, enterCode }

    init(prefillEmail: String = "") {
        self.prefillEmail = prefillEmail
        _email = State(initialValue: prefillEmail)
    }

    var body: some View {
        NavigationStack {
            Form {
                switch step {
                case .requestCode:
                    requestCodeSection
                case .enterCode:
                    enterCodeSection
                }

                if let errorMessage {
                    Section {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundStyle(Color.appError)
                            Text(errorMessage)
                                .foregroundStyle(Color.appError)
                                .font(.subheadline)
                        }
                    }
                }

                if let successMessage {
                    Section {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                            Text(successMessage)
                                .font(.subheadline)
                        }
                    }
                }
            }
            .navigationTitle("Reset Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                if step == .enterCode {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Resend") { sendCode() }
                            .disabled(isLoading)
                    }
                }
            }
        }
    }

    private var requestCodeSection: some View {
        Group {
            Section("Email") {
                TextField("Email address", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
            }

            Section {
                Button {
                    sendCode()
                } label: {
                    HStack {
                        Spacer()
                        if isLoading { ProgressView() } else { Text("Send Code").fontWeight(.semibold) }
                        Spacer()
                    }
                }
                .disabled(email.isEmpty || isLoading)
            }
        }
    }

    private var enterCodeSection: some View {
        Group {
            Section {
                Text("A 6-digit code was sent to **\(email)**. It expires in 15 minutes.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section("Code") {
                TextField("6-digit code", text: $code)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
            }

            Section("New Password") {
                SecureField("New password (min 8 characters)", text: $newPassword)
                    .textContentType(.newPassword)
                SecureField("Confirm new password", text: $confirmPassword)
                    .textContentType(.newPassword)
            }

            Section {
                Button {
                    resetPassword()
                } label: {
                    HStack {
                        Spacer()
                        if isLoading { ProgressView() } else { Text("Reset Password").fontWeight(.semibold) }
                        Spacer()
                    }
                }
                .disabled(!resetValid || isLoading)
            }
        }
    }

    private var resetValid: Bool {
        code.count == 6 && newPassword.count >= 8 && newPassword == confirmPassword
    }

    private func sendCode() {
        errorMessage = nil
        isLoading = true
        Task {
            do {
                try await auth.requestPasswordReset(email: email)
                step = .enterCode
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    private func resetPassword() {
        errorMessage = nil
        isLoading = true
        Task {
            do {
                try await auth.confirmPasswordReset(email: email, code: code, newPassword: newPassword)
                successMessage = "Password updated! You can now log in."
                try? await Task.sleep(for: .seconds(1.5))
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}
