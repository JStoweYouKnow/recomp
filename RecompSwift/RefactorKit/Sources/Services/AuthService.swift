import Foundation
import SwiftData
import Observation

@MainActor
@Observable
public final class AuthService {
    public private(set) var currentUser: UserProfile?
    public private(set) var isAuthenticated = false
    public private(set) var isLoading = false

    public var isDemo: Bool { currentUser?.id == "demo-user-001" }

    private let api: APIClient
    private var modelContext: ModelContext?
    /// Written once in `init` and only read in the nonisolated `deinit`; `nonisolated(unsafe)`
    /// lets `deinit` remove the observer without a main-actor hop. The token is effectively
    /// immutable after init, so this is safe.
    private nonisolated(unsafe) var sessionExpiryObserver: NSObjectProtocol?

    public init(api: APIClient = .shared) {
        self.api = api
        sessionExpiryObserver = NotificationCenter.default.addObserver(
            forName: .recompSessionExpired,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.handleSessionExpired() }
        }
    }

    deinit {
        if let sessionExpiryObserver {
            NotificationCenter.default.removeObserver(sessionExpiryObserver)
        }
    }

    /// Binds the app's main SwiftData context so authenticated profiles are stored
    /// in (and read back from) the single source of truth. Call once at app launch
    /// before `checkSession()`.
    public func bind(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    /// Re-points `currentUser` at the persisted SwiftData row after a sync pull
    /// updated it, so the UI and edit flow observe the same instance.
    public func refreshCurrentUserFromStore() {
        guard let ctx = modelContext else { return }
        let targetId = (try? KeychainService.loadUserId()) ?? currentUser?.id
        var descriptor = FetchDescriptor<UserProfile>()
        if let targetId {
            descriptor.predicate = #Predicate { $0.id == targetId }
        }
        descriptor.fetchLimit = 1
        if let persisted = (try? ctx.fetch(descriptor))?.first {
            currentUser = persisted
        }
    }

    /// Stores a server profile into SwiftData (single source of truth) and returns
    /// the persisted instance. Falls back to a detached model only if no context is
    /// bound yet (should not happen after `bind(modelContext:)`).
    @discardableResult
    private func applyProfile(_ dto: UserProfileDTO) -> UserProfile {
        if let ctx = modelContext {
            let persisted = UserProfile.upsert(from: dto, in: ctx)
            try? ctx.save()
            return persisted
        }
        return mapProfile(dto)
    }

    /// Refreshes session from the server. Does not set `isLoading` so the UI can show
    /// sign-in immediately instead of a blocking splash for up to the request timeout.
    public func checkSession() async {
        do {
            let response: AuthResponse = try await api.request(AuthAPI.me)
            guard response.authenticated, let dto = response.profile else {
                isAuthenticated = false
                currentUser = nil
                return
            }
            if let userId = response.userId {
                try? KeychainService.save(userId: userId)
            }
            if let token = response.apiToken {
                try? KeychainService.saveApiToken(token)
            }
            currentUser = applyProfile(dto)
            isAuthenticated = true
        } catch {
            // Don't sign the user out merely because the network is unavailable:
            // if we have a stored session, stay authenticated on cached local data.
            if let apiError = error as? APIError, apiError.isConnectivityFailure,
               (try? KeychainService.loadUserId()) != nil {
                refreshCurrentUserFromStore()
                isAuthenticated = currentUser != nil
            } else {
                isAuthenticated = false
                currentUser = nil
            }
        }
    }

    public func register(_ payload: SignUpPayload) async throws {
        isLoading = true
        defer { isLoading = false }

        let response: AuthResponse = try await api.request(AuthAPI.register(payload))
        if let dto = response.profile {
            if let userId = response.userId {
                try? KeychainService.save(userId: userId)
            }
            if let token = response.apiToken {
                try? KeychainService.saveApiToken(token)
            }
            currentUser = applyProfile(dto)
            isAuthenticated = true
        }
    }

    public func login(email: String, password: String) async throws {
        isLoading = true
        defer { isLoading = false }

        let response: AuthResponse = try await api.request(AuthAPI.login(email: email, password: password))
        guard let dto = response.profile else {
            throw APIError.serverError("Sign-in did not return a profile. Check your email and password.")
        }
        if let userId = response.userId {
            try? KeychainService.save(userId: userId)
        }
        if let token = response.apiToken {
            try? KeychainService.saveApiToken(token)
        }
        currentUser = applyProfile(dto)
        isAuthenticated = true
    }

    public func loadDemo() async throws {
        isLoading = true
        defer { isLoading = false }

        let response: AuthResponse = try await api.request(AuthAPI.demo)
        if let userId = response.userId {
            try? KeychainService.save(userId: userId)
        }
        if let token = response.apiToken {
            try? KeychainService.saveApiToken(token)
        }
        if let dto = response.profile {
            currentUser = applyProfile(dto)
            isAuthenticated = true
        }
    }

    public func claimAccount(email: String, password: String) async throws {
        try await api.requestVoid(AuthAPI.claim(email: email, password: password))
    }

    public func requestPasswordReset(email: String) async throws {
        try await api.requestVoid(AuthAPI.forgotPassword(email: email))
    }

    public func confirmPasswordReset(email: String, code: String, newPassword: String) async throws {
        try await api.requestVoid(AuthAPI.resetPassword(email: email, code: code, newPassword: newPassword))
    }

    public func deleteAccount() async throws {
        try await api.requestVoid(AuthAPI.deleteAccount)
        logout()
    }

    /// Explicit user logout / account deletion. Clears credentials AND wipes local
    /// data + per-user caches so a shared device cannot leak this account's data to
    /// the next sign-in.
    public func logout() {
        currentUser = nil
        isAuthenticated = false
        try? KeychainService.delete()
        clearSessionCookies()

        if let ctx = modelContext {
            LocalStore.wipeAll(ctx)
        }
        LocalStore.clearCachedDefaults()
        WorkoutService.shared.reset()
    }

    /// Invoked when any request returns HTTP 401 (see `.recompSessionExpired`).
    /// Clears credentials and routes back to sign-in, but intentionally preserves
    /// local data — it re-syncs after re-login, and this avoids wiping data on the
    /// routine startup `/me` probe.
    public func handleSessionExpired() {
        currentUser = nil
        isAuthenticated = false
        try? KeychainService.delete()
        clearSessionCookies()
    }

    private func clearSessionCookies() {
        if let cookies = HTTPCookieStorage.shared.cookies {
            for cookie in cookies where cookie.name == "recomp_uid" {
                HTTPCookieStorage.shared.deleteCookie(cookie)
            }
        }
    }

    private func mapProfile(_ dto: UserProfileDTO) -> UserProfile {
        UserProfile(
            id: dto.id,
            name: dto.name,
            email: dto.email,
            avatarDataUrl: dto.avatarDataUrl,
            age: dto.age,
            weight: dto.weight,
            height: dto.height,
            gender: Gender(rawValue: dto.gender) ?? .other,
            fitnessLevel: FitnessLevel(rawValue: dto.fitnessLevel) ?? .beginner,
            goal: FitnessGoal(rawValue: dto.goal) ?? .maintain,
            dietaryRestrictions: dto.dietaryRestrictions ?? [],
            injuriesOrLimitations: dto.injuriesOrLimitations ?? [],
            dailyActivityLevel: ActivityLevel(rawValue: dto.dailyActivityLevel ?? "moderate") ?? .moderate,
            unitSystem: MeasurementSystem(rawValue: dto.unitSystem ?? "us") ?? .us,
            workoutLocation: WorkoutLocation(rawValue: dto.workoutLocation ?? ""),
            workoutEquipment: (dto.workoutEquipment ?? []).compactMap { WorkoutEquipment(rawValue: $0) },
            workoutDaysPerWeek: dto.workoutDaysPerWeek ?? 4,
            workoutTimeframe: WorkoutTimeframe(rawValue: dto.workoutTimeframe ?? ""),
            proAccess: dto.proAccess ?? false
        )
    }
}
