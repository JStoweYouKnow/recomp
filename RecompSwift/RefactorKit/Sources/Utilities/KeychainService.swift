import Foundation
import Security

public struct KeychainService {
    private static let service = "com.refactor.ios"
    private static let userIdKey = "refactor_user_id"

    public static func save(userId: String) throws {
        let data = Data(userId.utf8)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: userIdKey,
            kSecAttrAccessGroup as String: "group.com.refactor.ios",
        ]

        SecItemDelete(query as CFDictionary)

        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: userIdKey,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
            kSecAttrAccessGroup as String: "group.com.refactor.ios",
        ]

        // Mirror into App Group defaults BEFORE the keychain guard so the fallback
        // is always populated, even if the keychain access group write fails.
        RecompAppGroupDefaults.shared.set(userId, forKey: RecompUserDefaultsKeys.userId)

        let status = SecItemAdd(addQuery as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unableToSave(status)
        }
    }

    public static func loadUserId() throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: userIdKey,
            kSecAttrAccessGroup as String: "group.com.refactor.ios",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            guard let data = result as? Data,
                  let userId = String(data: data, encoding: .utf8) else {
                return nil
            }
            return userId
        case errSecItemNotFound:
            // Keychain unavailable (common on watchOS) — fall back to app group defaults.
            return RecompAppGroupDefaults.shared.string(forKey: RecompUserDefaultsKeys.userId)
        default:
            // Any other keychain error — fall back rather than throwing so watchOS stays functional.
            return RecompAppGroupDefaults.shared.string(forKey: RecompUserDefaultsKeys.userId)
        }
    }

    public static func delete() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: userIdKey,
            kSecAttrAccessGroup as String: "group.com.refactor.ios",
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unableToDelete(status)
        }

        RecompAppGroupDefaults.shared.removeObject(forKey: RecompUserDefaultsKeys.userId)
    }
}

public enum KeychainError: Error, LocalizedError {
    case unableToSave(OSStatus)
    case unableToLoad(OSStatus)
    case unableToDelete(OSStatus)

    public var errorDescription: String? {
        switch self {
        case .unableToSave(let s): return "Keychain save failed: \(s)"
        case .unableToLoad(let s): return "Keychain load failed: \(s)"
        case .unableToDelete(let s): return "Keychain delete failed: \(s)"
        }
    }
}
