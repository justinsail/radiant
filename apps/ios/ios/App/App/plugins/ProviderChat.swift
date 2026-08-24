import Foundation
import Capacitor

/// Talking to a cloud provider, natively.
///
/// ⚠️ THE REQUEST IS MADE HERE, NOT IN JAVASCRIPT, and that is the whole point.
/// The key lives in the Keychain; handing it to the web layer so it can call
/// fetch() would put a credential into a WKWebView's memory, its console, and
/// any crash report or screenshot taken of it. This plugin reads the key, makes
/// the call, and streams back only the text — the web layer never sees it.
///
/// Two wire formats cover every provider in the list: OpenAI's /chat/completions
/// (which OpenRouter, xAI, Nous, DeepSeek, Kimi, GLM, Groq and Mistral all
/// speak) and Anthropic's /v1/messages. Both stream server-sent events, so the
/// token events below are the same shape LocalModels already emits and the chat
/// UI does not need to know which kind of model it is talking to.
@objc(ProviderChat)
public class ProviderChat: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProviderChat"
    public let jsName = "ProviderChat"
    // ⚠️ Missing from this list = compiles, links, and is refused at runtime.
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "models", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private let service = "com.templetongroup.radiant.providers"
    private var live: Task<Void, Never>?

    private func key(for provider: String) -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: provider,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func authorize(_ req: inout URLRequest, provider: String, key: String) {
        if provider == "anthropic" {
            req.setValue(key, forHTTPHeaderField: "x-api-key")
            req.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        } else {
            req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }

    // MARK: - models

    /// The provider's own model list, so the picker shows what this key can
    /// actually reach rather than a list we hard-coded and let go stale.
    @objc func models(_ call: CAPPluginCall) {
        guard let provider = call.getString("provider"),
              let base = call.getString("baseUrl") else {
            return call.reject("provider and baseUrl are required")
        }
        guard let apiKey = key(for: provider) else {
            return call.reject("No key saved for \(provider)")
        }
        let path = provider == "anthropic" ? "/v1/models" : "/models"
        guard let url = URL(string: base + path) else { return call.reject("Bad baseUrl") }
        var req = URLRequest(url: url)
        authorize(&req, provider: provider, key: apiKey)

        Task {
            do {
                let (data, resp) = try await URLSession.shared.data(for: req)
                guard let http = resp as? HTTPURLResponse else { return call.reject("No response") }
                guard (200..<300).contains(http.statusCode) else {
                    // The vendor's own message is far more useful than ours —
                    // it says "expired", "no credit", "wrong key".
                    return call.reject(Self.message(from: data, status: http.statusCode))
                }
                let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                let rows = (json?["data"] as? [[String: Any]]) ?? []
                let ids = rows.compactMap { $0["id"] as? String }.sorted()
                call.resolve(["models": ids])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Pull a human-readable reason out of an error body, whatever shape it is.
    private static func message(from data: Data, status: Int) -> String {
        if let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let e = j["error"] as? [String: Any], let m = e["message"] as? String { return m }
            if let m = j["message"] as? String { return m }
        }
        if status == 401 { return "That key was refused. Check it is still valid." }
        if status == 429 { return "Rate limited — too many requests just now." }
        return "The provider returned \(status)."
    }

    // MARK: - send

    @objc func send(_ call: CAPPluginCall) {
        guard let provider = call.getString("provider"),
              let base = call.getString("baseUrl"),
              let model = call.getString("model"),
              let messages = call.getArray("messages") as? [[String: String]] else {
            return call.reject("provider, baseUrl, model and messages are required")
        }
        guard let apiKey = key(for: provider) else {
            return call.reject("No key saved for \(provider)")
        }
        let anthropic = provider == "anthropic"
        let path = anthropic ? "/v1/messages" : "/chat/completions"
        guard let url = URL(string: base + path) else { return call.reject("Bad baseUrl") }

        var body: [String: Any] = ["model": model, "stream": true]
        if anthropic {
            // Anthropic takes the system prompt beside the messages, not inside
            // them, and requires max_tokens.
            body["max_tokens"] = 4096
            body["messages"] = messages.filter { $0["role"] != "system" }
            if let sys = messages.first(where: { $0["role"] == "system" })?["content"] {
                body["system"] = sys
            }
        } else {
            body["messages"] = messages
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        authorize(&req, provider: provider, key: apiKey)
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        live?.cancel()
        live = Task { [weak self] in
            guard let self else { return }
            do {
                let (stream, resp) = try await URLSession.shared.bytes(for: req)
                guard let http = resp as? HTTPURLResponse else {
                    self.notifyListeners("cloudFailed", data: ["message": "No response"])
                    return call.reject("No response")
                }
                guard (200..<300).contains(http.statusCode) else {
                    var raw = Data()
                    for try await b in stream { raw.append(b) }
                    let msg = Self.message(from: raw, status: http.statusCode)
                    self.notifyListeners("cloudFailed", data: ["message": msg])
                    return call.reject(msg)
                }
                for try await line in stream.lines {
                    if Task.isCancelled { break }
                    guard line.hasPrefix("data:") else { continue }
                    let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                    if payload == "[DONE]" { break }
                    guard let d = payload.data(using: .utf8),
                          let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any]
                    else { continue }
                    if let text = Self.chunk(from: j, anthropic: anthropic), !text.isEmpty {
                        self.notifyListeners("cloudToken", data: ["text": text])
                    }
                }
                self.notifyListeners("cloudDone", data: [:])
                call.resolve(["ok": true])
            } catch {
                if Task.isCancelled || (error as? URLError)?.code == .cancelled {
                    self.notifyListeners("cloudDone", data: ["stopped": true])
                    call.resolve(["stopped": true])
                } else {
                    self.notifyListeners("cloudFailed", data: ["message": error.localizedDescription])
                    call.reject(error.localizedDescription)
                }
            }
        }
    }

    /// One delta, from either wire format.
    private static func chunk(from j: [String: Any], anthropic: Bool) -> String? {
        if anthropic {
            guard let d = j["delta"] as? [String: Any] else { return nil }
            return d["text"] as? String
        }
        guard let choices = j["choices"] as? [[String: Any]],
              let delta = choices.first?["delta"] as? [String: Any] else { return nil }
        return delta["content"] as? String
    }

    @objc func stop(_ call: CAPPluginCall) {
        live?.cancel()
        live = nil
        call.resolve(["ok": true])
    }
}
