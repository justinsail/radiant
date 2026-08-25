import Foundation

/// The download path's arithmetic and naming, with no dependencies.
///
/// ⚠️ WHY THIS IS ITS OWN FILE. Download progress broke four separate times, and
/// every one of them was in logic that has nothing to do with MLX, HuggingFace,
/// or Capacitor — a folder name, and some subtraction. But because it lived
/// inside a plugin that cannot even initialise in the Simulator, the only way to
/// exercise it was to install a build on Tony's phone and ask him to watch. He
/// was the test harness for a bug in two lines of division.
///
/// Everything here is pure: values in, values out, no filesystem, no network, no
/// UIKit. `scripts/test-download-math.swift` compiles this file on its own and
/// asserts every regression that has actually shipped. Run it before touching
/// the download path.
enum DownloadMath {

    // MARK: - where the files live

    /// HuggingFace's on-disk folder name for a repo id.
    ///
    /// Measured off a real device: `mlx-community/Llama-3.2-1B-Instruct-4bit`
    /// is stored as `models--mlx-community--Llama-3.2-1B-Instruct-4bit`. Getting
    /// this wrong pointed every measurement at an empty directory, which is what
    /// made progress report nothing at all.
    static func cacheFolderName(for repo: String) -> String {
        "models--" + repo.replacingOccurrences(of: "/", with: "--")
    }

    // MARK: - how far along it is

    /// A snapshot of the two places a model's bytes can be.
    struct Sizes {
        /// bytes already in the HuggingFace cache for this model
        var cache: Int64
        /// bytes in the app's tmp/ — where URLSession writes the file currently
        /// in flight, and where a previous download may have left rubbish
        var inFlight: Int64
    }

    /// The fraction to show, or `nil` when there is no honest number.
    ///
    /// `nil` means "say Downloading…, not 0%": either nothing has moved yet, or
    /// the model was already complete before this started and there is no wait
    /// to report.
    ///
    /// - Parameters:
    ///   - expected: the catalogue's size for this model, in bytes.
    ///   - start: sizes captured the moment the download began.
    ///   - now: sizes captured this tick.
    static func fraction(expected: Int64, start: Sizes, now: Sizes) -> Double? {
        // Nothing left to fetch: a cache hit. Reporting a percentage would be
        // inventing a wait that is not happening.
        let remaining = expected - start.cache
        guard remaining > 0 else { return nil }

        // Growth in EITHER place counts, each against its own baseline. Folding
        // them into one baseline let stale tmp leftovers inflate it past
        // `expected`, which made remaining zero and killed the poller — the
        // regression that shipped on 2026-08-24.
        let grewInCache = max(now.cache - start.cache, 0)
        let grewInFlight = max(now.inFlight - start.inFlight, 0)
        let added = grewInCache + grewInFlight
        guard added > 0 else { return nil }

        // Never 1.0 from arithmetic: only downloadDone means done. A catalogue
        // size is rounded, so a real download can exceed it slightly.
        return min(0.999, Double(added) / Double(remaining))
    }

    /// Whether this tick is worth telling the UI about.
    ///
    /// A multi-gigabyte download reports constantly and the UI is a 29pt arc, so
    /// anything finer than a whole percent is thousands of bridge crossings
    /// nobody can see. When there is no percentage to be had, fall back to each
    /// new megabyte so the number still moves.
    static func shouldEmit(fraction: Double?, bytes: Int64,
                           lastPercent: inout Int, lastMegabytes: inout Int64) -> Bool {
        if let f = fraction {
            let pct = Int(f * 100)
            guard pct != lastPercent else { return false }
            lastPercent = pct
            return true
        }
        let mb = bytes / 1_000_000
        guard mb != lastMegabytes else { return false }
        lastMegabytes = mb
        return true
    }

    // MARK: - is it actually here

    /// Whether a model counts as present.
    ///
    /// AND, not OR, and both halves are load-bearing:
    ///  · the RECEIPT says the load once completed — without it, a download the
    ///    user stopped at 60% (cancel leaves partial bytes so it can resume)
    ///    reads as a finished model;
    ///  · the FILES say it is still there — without that, a UserDefaults flag
    ///    keeps claiming a model that iOS purged from Caches under storage
    ///    pressure, which it is entitled to do.
    static func isPresent(hasReceipt: Bool, bytesInCache: Int64, expected: Int64) -> Bool {
        guard hasReceipt else { return false }
        // 60% of the catalogue size: high enough that stray config files never
        // count, low enough to survive the catalogue's rounded numbers.
        return Double(bytesInCache) >= Double(expected) * 0.6
    }
}
