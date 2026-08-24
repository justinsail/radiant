import Foundation
import Capacitor
import Security

/// Keychain storage for provider API keys.
///
/// ⚠️ THESE ARE CREDENTIALS AND THEY DO NOT GO IN localStorage. A WKWebView's
/// local storage is a plain file inside the app container: readable from a
/// backup, from a jailbroken device, and by anything that can reach the
/// container. An API key sitting there is a key anyone with the phone's backup
/// can spend.
///
/// `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`:
///  · afterFirstUnlock — a download or a request can still run when the screen
///    is locked, which it cannot with WhenUnlocked.
///  · ThisDeviceOnly — the key never travels in an iCloud backup to another
///    device. Restoring a backup should not silently move someone's billing
///    credentials onto new hardware.
@objc(SecureStore)
public class SecureStore: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureStore"
    public let jsName = "SecureStore"
    // ⚠️ A method missing from this list compiles, links, and is still refused
    // at runtime. See the same note in LocalModels.swift.
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keys", returnType: CAPPluginReturnPromise)
    ]

    private let service = "com.templetongroup.radiant.providers"

    private func query(_ account: String? = nil) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ]
        if let account { q[kSecAttrAccount as String] = account }
        return q
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let account = call.getString("key"), !account.isEmpty,
              let value = call.getString("value"), !value.isEmpty else {
            return call.reject("key and value are required")
        }
        let data = Data(value.utf8)
        // delete-then-add rather than update: an update on a missing item fails,
        // and this is called both to create and to replace
        SecItemDelete(query(account) as CFDictionary)
        var add = query(account)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else {
            return call.reject("Keychain write failed (\(status))")
        }
        call.resolve(["key": account])
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let account = call.getString("key") else { return call.reject("key is required") }
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return call.resolve(["value": NSNull()])
        }
        call.resolve(["value": value])
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let account = call.getString("key") else { return call.reject("key is required") }
        SecItemDelete(query(account) as CFDictionary)
        call.resolve(["key": account])
    }

    /// Which providers have a key — the NAMES only. The UI needs to know a key
    /// exists so it can show "Connected"; it never needs the key itself, and
    /// handing secrets to the web layer to render is how they end up in a log.
    @objc func keys(_ call: CAPPluginCall) {
        var q = query()
        q[kSecReturnAttributes as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitAll
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        guard status == errSecSuccess, let rows = item as? [[String: Any]] else {
            return call.resolve(["keys": []])
        }
        call.resolve(["keys": rows.compactMap { $0[kSecAttrAccount as String] as? String }])
    }
}
