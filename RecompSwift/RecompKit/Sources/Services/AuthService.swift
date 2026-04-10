import Foundation
import SwiftData
import Observation

@MainActor
@Observable
public final class AuthService {
    private(set) var currentUser: UserProfile?
    private(set) var isAuthenticated = false
    private(set) var isLoading = false

    private let api: APIClient

    public init(api: APIClient = .shared) {
        self.api = api
    }

    public func checkSession() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response: AuthResponse = try await api.request(AuthAPI.me)
            if response.authenticated, let dto = response.profile {
                currentUser = mapProfile(dto)
                isAuthenticated = true
                if let userId = response.userId {
                    try? KeychainService.save(userId: userId)
                }
            }
        } catch {
            isAuthenticated = false
            currentUser = nil
        }
    }

    public func register(_ payload: SignUpPayload) async throws {
        isLoading = true
        defer { isLoading = false }

        let response: AuthResponse = try await api.request(AuthAPI.register(payload))
        if let dto = response.profile {
            currentUser = mapProfile(dto)
            isAuthenticated = true
            if let userId = response.userId {
                try? KeychainService.save(userId: userId)
            }
        }
    }

    public func login(email: String, password: String) async throws {
        isLoading = true
        defer { isLoading = false }

        let response: AuthResponse = try await api.request(AuthAPI.login(email: email, password: password))
        if let dto = response.profile {
            currentUser = mapProfile(dto)
            isAuthenticated = true
            if let userId = response.userId {
                try? KeychainService.save(userId: userId)
            }
        }
    }

    public func loadDemo() async throws {
        isLoading = true
        defer { isLoading = false }

        let response: AuthResponse = try await api.request(AuthAPI.demo)
        if let dto = response.profile {
            currentUser = mapProfile(dto)
            isAuthenticated = true
        }
    }

    public func claimAccount(email: String, password: String) async throws {
        try await api.requestVoid(AuthAPI.claim(email: email, password: password))
    }

    public func logout() {
        currentUser = nil
        isAuthenticated = false
        try? KeychainService.delete()

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
            workoutTimeframe: WorkoutTimeframe(rawValue: dto.workoutTimeframe ?? "")
        )
    }
}
