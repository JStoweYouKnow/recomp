import Foundation
import Security

public struct KeychainService {
    private static let service = "com.recomp.ios"
    private static let userIdKey = "recomp_user_id"

    public static func save(userId: String) throws {
        let data = Data(userId.utf8)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: userIdKey,
        ]

        SecItemDelete(query as CFDictionary)

        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: userIdKey,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
            kSecAttrAccessGroup as String: "group.com.recomp.ios",
        ]

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
            return nil
        default:
            throw KeychainError.unableToLoad(status)
        }
    }

    public static func delete() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: userIdKey,
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unableToDelete(status)
        }
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
