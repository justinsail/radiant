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
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diskInfo", returnType: CAPPluginReturnPromise)
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
        let id = entry.id
        Task {
            // The progress overload's handler is @Sendable, so it cannot touch
            // the plugin — that is what blocked real percentages. It can hold an
            // AsyncStream continuation, which IS Sendable, so the continuation
            // becomes the relay: the handler yields fractions from whatever
            // thread the download is on, and the pump below — which does have
            // self — turns them into plugin events.
            let (fractions, feed) = AsyncStream<Double>.makeStream(
                bufferingPolicy: .bufferingNewest(1)
            )
            // A multi-gigabyte download reports progress constantly. The UI is a
            // 29pt arc, so anything finer than a whole percent is thousands of
            // bridge crossings that cannot be seen.
            let pump = Task { [weak self] in
                var last = -1
                for await f in fractions {
                    let pct = Int(f * 100)
                    guard pct != last else { continue }
                    last = pct
                    self?.notifyListeners(
                        "downloadProgress", data: ["id": id, "progress": f]
                    )
                }
            }
            do {
                self.notifyListeners("downloadStarted", data: ["id": id])
                _ = try await #huggingFaceLoadModelContainer(
                    configuration: entry.config
                ) { progress in
                    feed.yield(progress.fractionCompleted)
                }
                feed.finish()
                await pump.value
                self.markDownloaded(id)
                self.notifyListeners("downloadDone", data: ["id": id])
                call.resolve(["id": id])
            } catch {
                feed.finish()
                await pump.value
                self.notifyListeners("downloadFailed", data: [
                    "id": id, "message": error.localizedDescription
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

    // MARK: - storage

    /// Free and total bytes on the device, for the storage line on the root
    /// screen ("2.5 GB of 128 GB used by models").
    ///
    /// ⚠️ This lives here rather than coming from @capacitor/device on purpose.
    /// Adding that plugin means `npx cap sync ios`, and sync rewrites
    /// CapApp-SPM/Package.swift — which is where the MLX dependencies this app
    /// cannot run without are hand-added. Trading a working inference stack for
    /// two numbers Foundation already has is not a trade worth making.
    ///
    /// volumeAvailableCapacityForImportantUsage is the figure Settings shows,
    /// which is the whole point: a number the user can go and check.
    @objc func diskInfo(_ call: CAPPluginCall) {
        let url = URL(fileURLWithPath: NSHomeDirectory())
        do {
            let v = try url.resourceValues(forKeys: [
                .volumeTotalCapacityKey,
                .volumeAvailableCapacityForImportantUsageKey
            ])
            let total = v.volumeTotalCapacity.map(Double.init) ?? 0
            let free = v.volumeAvailableCapacityForImportantUsage.map(Double.init) ?? 0
            call.resolve(["total": total, "free": free])
        } catch {
            call.reject(error.localizedDescription)
        }
    }
}
