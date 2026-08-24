import Foundation
import Capacitor

import MLXLLM
import MLXLMCommon
import MLXHuggingFace
import HuggingFace
import Tokenizers

/// Running a model ON THE PHONE.
///
/// This is the app's primary mode, not a fallback: someone installs Radiant,
/// picks a model, downloads it, and starts talking — no Mac, no account, no
/// network after the download. Connecting to Radiant on a Mac is the secondary
/// path for people who have one.
///
/// The web UI drives this over Capacitor. Downloads and generation both report
/// progress as events rather than blocking, because a 1–4 GB download and a
/// token stream both need to show something while they work.
@objc(LocalModels)
public class LocalModels: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocalModels"
    public let jsName = "LocalModels"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloaded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    /// A short, curated list rather than every model on Hugging Face.
    /// Picking a model is the first thing a new user does, and a wall of
    /// 200 names with quantisation suffixes is where they give up. Sizes are
    /// the download, measured, so nobody starts a 4 GB pull on cellular by
    /// accident.
    private struct Entry {
        let id: String, name: String, blurb: String, gb: Double
        let config: ModelConfiguration
    }
    private let catalog: [Entry] = [
        Entry(id: "llama3.2-1b", name: "Llama 3.2 1B",
              blurb: "Fastest. Good for quick questions and rewriting.", gb: 0.7,
              config: LLMRegistry.llama3_2_1B_4bit),
        Entry(id: "qwen3-1.7b", name: "Qwen 3 1.7B",
              blurb: "A good all-rounder on any recent iPhone.", gb: 1.0,
              config: LLMRegistry.qwen3_1_7b_4bit),
        Entry(id: "gemma3-1b", name: "Gemma 3 1B",
              blurb: "Google's small model, tuned to run on phones.", gb: 0.8,
              config: LLMRegistry.gemma3_1B_qat_4bit),
        Entry(id: "lfm2-1.2b", name: "LFM2 1.2B",
              blurb: "Liquid's phone-first model. Very fast.", gb: 0.8,
              config: LLMRegistry.lfm2_1_2b_4bit),
        Entry(id: "qwen3-4b", name: "Qwen 3 4B",
              blurb: "Noticeably smarter. Wants a Pro with headroom.", gb: 2.3,
              config: LLMRegistry.qwen3_4b_4bit)
    ]

    private var loaded: (id: String, container: ModelContainer)?
    private var task: Task<Void, Never>?

    // MARK: - catalog

    @objc func list(_ call: CAPPluginCall) {
        let have = Set(downloadedIds())
        call.resolve(["models": catalog.map { [
            "id": $0.id, "name": $0.name, "blurb": $0.blurb,
            "sizeGB": $0.gb, "downloaded": have.contains($0.id)
        ] }])
    }

    @objc func downloaded(_ call: CAPPluginCall) {
        call.resolve(["ids": downloadedIds()])
    }

    /// Which models are on the device.
    ///
    /// Recorded here rather than probed from the Hugging Face cache: the
    /// downloader's on-disk layout is its own business and has already changed
    /// once (HubApi -> HubClient). A flag we set after a successful download is
    /// both simpler and harder to get wrong.
    private let key = "radiant.localModels.downloaded"
    private func downloadedIds() -> [String] {
        UserDefaults.standard.stringArray(forKey: key) ?? []
    }
    private func markDownloaded(_ id: String) {
        var ids = Set(downloadedIds()); ids.insert(id)
        UserDefaults.standard.set(Array(ids), forKey: key)
    }
    private func forget(_ id: String) {
        UserDefaults.standard.set(downloadedIds().filter { $0 != id }, forKey: key)
    }
    /// Where swift-huggingface puts model files on iOS.
    private func cacheDir(for repo: String) -> URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("huggingface/models/\(repo)")
    }

    // MARK: - download

    @objc func download(_ call: CAPPluginCall) {
        guard let entry = catalog.first(where: { $0.id == call.getString("id") }) else {
            return call.reject("Unknown model")
        }
        Task {
            do {
                // The progress overload wants a @Sendable closure, which cannot
                // capture the plugin. Report start/finish for now; wiring real
                // percentages needs a Sendable relay (TG-221).
                self.notifyListeners("downloadStarted", data: ["id": entry.id])
                _ = try await #huggingFaceLoadModelContainer(configuration: entry.config)
                self.markDownloaded(entry.id)
                self.notifyListeners("downloadDone", data: ["id": entry.id])
                call.resolve(["id": entry.id])
            } catch {
                self.notifyListeners("downloadFailed", data: [
                    "id": entry.id, "message": error.localizedDescription
                ])
                call.reject("Download failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let entry = catalog.first(where: { $0.id == call.getString("id") }) else {
            return call.reject("Unknown model")
        }
        if loaded?.id == entry.id { loaded = nil }
        if let dir = cacheDir(for: entry.config.name) {
            try? FileManager.default.removeItem(at: dir)
        }
        forget(entry.id)
        call.resolve()
    }

    // MARK: - generation

    @objc func generate(_ call: CAPPluginCall) {
        guard let entry = catalog.first(where: { $0.id == call.getString("id") }) else {
            return call.reject("Unknown model")
        }
        let prompt = call.getString("prompt") ?? ""
        task?.cancel()
        task = Task {
            do {
                let container: ModelContainer
                if let l = loaded, l.id == entry.id {
                    container = l.container
                } else {
                    // loading evicts the previous model: two multi-GB models
                    // will not fit in a phone's memory at once
                    loaded = nil
                    container = try await #huggingFaceLoadModelContainer(configuration: entry.config)
                    loaded = (entry.id, container)
                }
                let session = ChatSession(container)
                for try await chunk in session.streamResponse(to: prompt) {
                    if Task.isCancelled { break }
                    self.notifyListeners("token", data: ["id": entry.id, "text": chunk])
                }
                self.notifyListeners("done", data: ["id": entry.id])
                call.resolve()
            } catch {
                self.notifyListeners("failed", data: ["message": error.localizedDescription])
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        task?.cancel(); task = nil
        call.resolve()
    }
}
