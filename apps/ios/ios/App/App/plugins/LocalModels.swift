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
        // ⚠️ A method missing from THIS list compiles, links, and has a live
        // ObjC selector — and Capacitor still refuses the call at runtime. It
        // is how you ship a button that does nothing. Add here as well as below.
        CAPPluginMethod(name: "cancelDownload", returnType: CAPPluginReturnPromise),
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
    /// ⚠️ SIZES ARE MEASURED, NOT ESTIMATED. Each is the summed blob size from
    /// huggingface.co/api/models/<id>?blobs=true, because the download progress
    /// bar divides by this number — a guessed size shows a wrong percentage.
    /// Re-check them when the catalogue changes.
    ///
    /// Chosen against what MLX can actually run today (LLMModelFactory's
    /// registry, 67 entries) rather than what was current when this was
    /// written: Qwen 3.5 and Gemma 3n are both here now, and Gemma 3n E4B is
    /// the one Locally leads with. Ordered smallest first, which is also
    /// slowest-phone first.
    private let catalog: [Entry] = [
        Entry(id: "lfm2-1.2b", name: "LFM2 1.2B",
              blurb: "Fastest, and built for phones. Good for quick questions.", gb: 0.7,
              config: LLMRegistry.lfm2_1_2b_4bit),
        Entry(id: "qwen3-1.7b", name: "Qwen 3 1.7B",
              blurb: "The best all-rounder on any recent iPhone.", gb: 1.0,
              config: LLMRegistry.qwen3_1_7b_4bit),
        Entry(id: "qwen3.5-2b", name: "Qwen 3.5 2B",
              blurb: "Newest generation. Sharper reasoning for its size.", gb: 1.8,
              config: LLMRegistry.qwen3_5_2b_4bit),
        Entry(id: "llama3.2-3b", name: "Llama 3.2 3B",
              blurb: "Meta's. Strong at everyday writing and rewriting.", gb: 1.8,
              config: LLMRegistry.llama3_2_3B_4bit),
        Entry(id: "qwen3-4b", name: "Qwen 3 4B",
              blurb: "Noticeably smarter. Wants a Pro with headroom.", gb: 2.3,
              config: LLMRegistry.qwen3_4b_4bit),
        Entry(id: "gemma3n-e4b", name: "Gemma 3n E4B",
              blurb: "Google's phone-tuned flagship. Needs room and a recent Pro.", gb: 3.9,
              config: LLMRegistry.gemma3n_E4B_it_lm_4bit)
    ]

    private var loaded: (id: String, container: ModelContainer)?
    private var task: Task<Void, Never>?

    // MARK: - catalog

    /// Is this model actually on the phone? MEASURED, not remembered.
    ///
    /// ⚠️ A UserDefaults flag lies in BOTH directions, and both have bitten:
    ///  · it said no while a 663 MB Llama sat in the cache, so Settings read
    ///    "Nothing downloaded yet" over a model the user had just downloaded;
    ///  · and it can say yes after iOS purges Caches under storage pressure —
    ///    which it is entitled to do, since that is where the weights live —
    ///    leaving the app offering a model that is no longer there.
    ///
    /// ⚠️ AND, NOT OR — both halves are load-bearing.
    ///
    /// A size threshold ALONE says yes to a download the user stopped: cancel
    /// deliberately leaves partial bytes so a restart can resume, and a stop at
    /// 60% then reads as a finished model — hero says "Ready on this iPhone",
    /// the row shows a tick, and tapping it opens a chat with weights that are
    /// not all there. That is the same defect as the flag, inverted: the flag
    /// lied about absence, a bare threshold lies about presence.
    ///
    /// So: the RECEIPT says the load once completed (written only after
    /// `#huggingFaceLoadModelContainer` returns), and the FILES say it is still
    /// there (iOS may purge Caches under storage pressure, which is where the
    /// weights live). Either one alone is a lie in one direction.
    private func isOnDisk(_ entry: Entry) -> Bool {
        DownloadMath.isPresent(
            hasReceipt: downloadedIds().contains(entry.id),
            bytesInCache: bytesInCache(for: entry.config.name),
            expected: Int64(entry.gb * 1_000_000_000)
        )
    }

    @objc func list(_ call: CAPPluginCall) {
        call.resolve(["models": catalog.map { [
            "id": $0.id, "name": $0.name, "blurb": $0.blurb,
            "sizeGB": $0.gb, "downloaded": isOnDisk($0)
        ] }])
    }

    @objc func downloaded(_ call: CAPPluginCall) {
        call.resolve(["ids": catalog.filter { isOnDisk($0) }.map(\.id)])
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
    /// Where swift-huggingface ACTUALLY puts model files on iOS.
    ///
    /// ⚠️ MEASURED ON A DEVICE, NOT ASSUMED. This used to return
    /// `Documents/huggingface/models/<org>/<name>`, which is wrong twice over,
    /// and listing a real phone's container settled it:
    ///
    ///   Library/Caches/huggingface/hub/models--mlx-community--Llama-3.2-1B-Instruct-4bit/blobs/…
    ///
    /// Caches, not Documents — and HuggingFace's own folder convention, where
    /// the repo id is prefixed with `models--` and every slash becomes `--`.
    ///
    /// The cost of getting this wrong was two invisible bugs: the download
    /// progress poller measured an empty directory and so reported nothing at
    /// all (three "fixes" chased that symptom elsewhere), and `remove` deleted a
    /// path that never existed, so freeing space silently freed none.
    ///
    /// It also means the weights live in Caches, which iOS may purge under
    /// storage pressure. That is survivable — the app re-downloads — but it is
    /// the loader's choice, not ours.
    private func cacheDir(for repo: String) -> URL? {
        let folder = DownloadMath.cacheFolderName(for: repo)
        return FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appendingPathComponent("huggingface/hub/\(folder)")
    }

    /// Bytes currently on disk for a model. Walking the directory is cheap next
    /// to a multi-gigabyte download, and unlike a progress callback it cannot
    /// fail to fire.
    private func size(of dir: URL) -> Int64 {
        let fm = FileManager.default
        guard let en = fm.enumerator(at: dir, includingPropertiesForKeys: [.fileSizeKey],
                                     options: [.skipsHiddenFiles]) else { return 0 }
        var total: Int64 = 0
        for case let url as URL in en {
            let sz = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
            total += Int64(sz)
        }
        return total
    }

    /// Bytes landed for a model — INCLUDING the one still in flight.
    ///
    /// ⚠️ THE BIG FILE IS NOT IN THE CACHE DIRECTORY WHILE IT DOWNLOADS.
    /// swift-huggingface fetches each blob with `URLSession.download(for:delegate:)`,
    /// which writes to a temporary file and only moves it into `blobs/` on
    /// completion (HubClient+Files.swift, "Download or resume into incomplete
    /// blob until success"). So watching only the cache directory shows the few
    /// small config files land — about 2% of a Llama — then nothing at all for
    /// the entire 663 MB, then everything at once. Which is exactly what Tony
    /// saw: "went to 2% stayed there whole time and then went to 100%".
    ///
    /// The app's own tmp/ is where that in-flight file lives, and it is
    /// otherwise empty in this app, so its size IS the current transfer.
    private func bytesInCache(for repo: String) -> Int64 {
        guard let dir = cacheDir(for: repo) else { return 0 }
        return size(of: dir)
    }

    private func bytesInFlight() -> Int64 {
        size(of: FileManager.default.temporaryDirectory)
    }

    private func bytesOnDisk(for repo: String) -> Int64 {
        bytesInCache(for: repo) + bytesInFlight()
    }

    // MARK: - download

    /// Running downloads, so they can be cancelled. Capacitor calls plugin
    /// methods off the main thread, and cancelDownload can land while the job
    /// is clearing its own entry — hence the lock rather than a bare dictionary.
    private let jobLock = NSLock()
    private var jobs: [String: Task<Void, Never>] = [:]

    private func setJob(_ id: String, _ task: Task<Void, Never>?) {
        jobLock.lock(); defer { jobLock.unlock() }
        jobs[id] = task
    }
    private func job(_ id: String) -> Task<Void, Never>? {
        jobLock.lock(); defer { jobLock.unlock() }
        return jobs[id]
    }

    @objc func download(_ call: CAPPluginCall) {
        guard let entry = catalog.first(where: { $0.id == call.getString("id") }) else {
            return call.reject("Unknown model")
        }
        let id = entry.id
        // A second tap must not start a second download of the same weights.
        if job(id) != nil { return call.resolve(["id": id, "alreadyRunning": true]) }
        let task = Task {
            // The progress overload's handler is @Sendable, so it cannot touch
            // the plugin — that is what blocked real percentages. It can hold an
            // AsyncStream continuation, which IS Sendable, so the continuation
            // becomes the relay: the handler yields fractions from whatever
            // thread the download is on, and the pump below — which does have
            // self — turns them into plugin events.
            // Carry BYTES as well as the fraction. `Progress.fractionCompleted`
            // sits at 0 for the whole transfer whenever the total size is not
            // known up front, which is exactly what happens pulling a repo of
            // shards — so a relay that only forwarded the fraction emitted
            // nothing at all, and the phone showed a bare "Downloading…" for
            // 2.3 GB. Bytes are always real, so the UI always has something
            // true to print.
            let (ticks, feed) = AsyncStream<(Double, Int64, Int64)>.makeStream(
                bufferingPolicy: .bufferingNewest(1)
            )
            // A multi-gigabyte download reports constantly. Throttle to a whole
            // percent, or — when there is no percent to be had — to each new
            // megabyte, so the number on screen still moves.
            let pump = Task { [weak self] in
                var lastPct = -1
                var lastMB: Int64 = -1
                for await (f, done, total) in ticks {
                    let pct = total > 0 ? Int(f * 100) : -1
                    let mb = done / 1_000_000
                    if pct >= 0 {
                        guard pct != lastPct else { continue }
                        lastPct = pct
                    } else {
                        guard mb != lastMB else { continue }
                        lastMB = mb
                    }
                    self?.notifyListeners("downloadProgress", data: [
                        "id": id,
                        "progress": total > 0 ? f : -1,
                        "completedBytes": done,
                        "totalBytes": total
                    ])
                }
            }

            // ⚠️ THE CALLBACK CANNOT BE TRUSTED TO FIRE.
            // Shipped twice on the belief that it would: first reading only
            // `fractionCompleted`, then adding byte counts. On a real device
            // neither produced a single event — `downloadStarted` arrived and
            // then nothing, so the phone read "Downloading…" for gigabytes.
            //
            // So progress is MEASURED instead of reported: poll the bytes that
            // have actually landed in the HuggingFace cache, against the
            // catalog's own size for this model. It cannot silently do nothing,
            // it survives the loader changing its progress plumbing, and it is
            // the number the user actually cares about.
            let expected = Int64(entry.gb * 1_000_000_000)
            let repo = entry.config.name
            // ⚠️ MEASURE THE DELTA, NOT THE TOTAL. Whatever is already cached
            // counts toward the folder's size, so a model that is partly — or
            // entirely — present made the very first tick read 100% and stay
            // there. Tony: "now downloading llama starts at 100% and doesnt
            // change." Progress is what THIS download adds, from here.
            // ⚠️ TWO BASELINES, because the two places bytes live are not the
            // same kind of thing. The cache holds what is already downloaded;
            // tmp holds the file currently in flight AND, crucially, whatever a
            // previous download left behind. Folding both into one baseline let
            // stale tmp leftovers inflate it past the expected size, which made
            // `remaining` zero, which broke out of the poller before it emitted
            // anything — no number at all, which is what Tony saw. Count only
            // what GROWS from here, on each independently.
            let start = DownloadMath.Sizes(
                cache: bytesInCache(for: repo),
                inFlight: bytesInFlight()
            )
            let poller = Task { [weak self] in
                var lastPct = -1
                var lastMB: Int64 = -1
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 500_000_000)
                    if Task.isCancelled { break }
                    guard let self else { break }
                    let now = DownloadMath.Sizes(
                        cache: self.bytesInCache(for: repo),
                        inFlight: self.bytesInFlight()
                    )
                    // ⚠️ The arithmetic lives in DownloadMath and is covered by
                    // scripts/test-download-math.sh. It broke four times in
                    // production while it lived inline here, because nothing
                    // could run it without a device. Change it THERE, with a
                    // test, not here.
                    guard let f = DownloadMath.fraction(expected: expected, start: start, now: now)
                    else { continue }
                    let done = now.cache + now.inFlight
                    var mb: Int64 = lastMB
                    guard DownloadMath.shouldEmit(fraction: f, bytes: done,
                                                  lastPercent: &lastPct, lastMegabytes: &mb)
                    else { continue }
                    lastMB = mb
                    self.notifyListeners("downloadProgress", data: [
                        "id": id, "progress": f,
                        "completedBytes": done, "totalBytes": expected
                    ])
                }
            }
            do {
                self.notifyListeners("downloadStarted", data: ["id": id])
                _ = try await #huggingFaceLoadModelContainer(
                    configuration: entry.config
                ) { progress in
                    feed.yield((
                        progress.fractionCompleted,
                        progress.completedUnitCount,
                        progress.totalUnitCount
                    ))
                }
                feed.finish()
                poller.cancel()
                await pump.value
                self.setJob(id, nil)
                self.markDownloaded(id)
                self.notifyListeners("downloadDone", data: ["id": id])
                call.resolve(["id": id])
            } catch {
                feed.finish()
                poller.cancel()
                await pump.value
                self.setJob(id, nil)
                // A download the user stopped is not a failure, and must never
                // surface as a red error. URLSession surfaces cancellation as
                // CancellationError from the async API and as URLError.cancelled
                // from the older path, so both count.
                let cancelled = error is CancellationError
                    || (error as? URLError)?.code == .cancelled
                    || Task.isCancelled
                if cancelled {
                    self.notifyListeners("downloadCancelled", data: ["id": id])
                    call.resolve(["id": id, "cancelled": true])
                } else {
                    self.notifyListeners("downloadFailed", data: [
                        "id": id, "message": error.localizedDescription
                    ])
                    call.reject("Download failed: \(error.localizedDescription)")
                }
            }
        }
        setJob(id, task)
    }

    /// Stop a running download. Cancellation propagates through the Swift Task
    /// into swift-huggingface's URLSession calls, so this really does stop the
    /// transfer rather than only hiding the UI.
    ///
    /// Whatever bytes already landed stay in the HuggingFace cache — starting
    /// the same model again picks up from there rather than from zero. Removing
    /// them here would turn "I tapped that by mistake" into "and now do the
    /// whole 2.3 GB again."
    @objc func cancelDownload(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            return call.reject("Missing id")
        }
        guard let running = job(id) else {
            // Already finished or never started. Not an error — the UI may have
            // been a frame behind the download.
            return call.resolve(["id": id, "running": false])
        }
        running.cancel()
        call.resolve(["id": id, "running": true])
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
