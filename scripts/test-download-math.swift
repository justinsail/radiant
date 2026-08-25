#!/usr/bin/env swift
//
// Regression tests for the iPhone download path.
//
//   swift scripts/test-download-math.swift
//
// Every case below is a bug that ACTUALLY SHIPPED to Tony's phone and was found
// by him, not by us — because the logic lived inside a plugin that cannot start
// in the Simulator, so the only way to run it was to install a build and watch.
// It is all pure arithmetic and string handling. It never needed a device.
//
// Add a case here the moment the download path breaks again, before fixing it.

import Foundation

// ── the file under test, compiled in ────────────────────────────────────────
// (kept as a literal include so this script stays a single dependency-free file
//  that CI or a human can run with one command)

var failures = 0
var checks = 0

func check(_ label: String, _ got: String, _ want: String) {
    checks += 1
    if got == want {
        print("  ok    \(label)")
    } else {
        failures += 1
        print("  FAIL  \(label)\n          got  \(got)\n          want \(want)")
    }
}

func pct(_ d: Double?) -> String {
    guard let d else { return "nil" }
    return String(Int((d * 100).rounded(.down))) + "%"
}

let GB: Int64 = 1_000_000_000

print("\nfolder naming — measured off a real device")
check("repo id becomes HuggingFace's folder",
      DownloadMath.cacheFolderName(for: "mlx-community/Llama-3.2-1B-Instruct-4bit"),
      "models--mlx-community--Llama-3.2-1B-Instruct-4bit")
check("a second slash is also doubled",
      DownloadMath.cacheFolderName(for: "org/sub/name"),
      "models--org--sub--name")

print("\nprogress — the four ways this has broken in production")

// 1. SHIPPED 2026-08-24: "went to 2% stayed there whole time and then 100%".
//    The big blob downloads into tmp/ and only moves into the cache at the end,
//    so watching the cache alone flatlines.
check("a file growing in tmp is progress, not a flatline",
      pct(DownloadMath.fraction(
          expected: GB,
          start: .init(cache: 20_000_000, inFlight: 0),
          now:   .init(cache: 20_000_000, inFlight: 500_000_000))),
      "51%")

// 2. SHIPPED 2026-08-24: "starts at 100% and doesnt change". A model already
//    in the cache made the very first tick read full.
check("an already-cached model is a cache hit, not 100% forever",
      pct(DownloadMath.fraction(
          expected: GB,
          start: .init(cache: GB, inFlight: 0),
          now:   .init(cache: GB, inFlight: 0))),
      "nil")

// 3. SHIPPED 2026-08-24, and it was a fix that caused it: one shared baseline
//    let junk left in tmp by an EARLIER download inflate the start past
//    `expected`, so remaining went to zero and the poller emitted nothing.
check("stale tmp leftovers do not kill the number",
      pct(DownloadMath.fraction(
          expected: GB,
          start: .init(cache: 0, inFlight: 3 * GB),   // 3 GB of junk sitting in tmp
          now:   .init(cache: 0, inFlight: 3 * GB + 250_000_000))),
      "25%")

// 4. A resumed download starts from what is already there, not from zero.
check("resume measures the remainder, not the whole file",
      pct(DownloadMath.fraction(
          expected: GB,
          start: .init(cache: 600_000_000, inFlight: 0),
          now:   .init(cache: 600_000_000, inFlight: 200_000_000))),
      "50%")

check("nothing has moved yet reads as no number, not 0%",
      pct(DownloadMath.fraction(
          expected: GB,
          start: .init(cache: 0, inFlight: 0),
          now:   .init(cache: 0, inFlight: 0))),
      "nil")

check("never reports a full 100 from arithmetic — only downloadDone means done",
      pct(DownloadMath.fraction(
          expected: GB,
          start: .init(cache: 0, inFlight: 0),
          now:   .init(cache: 0, inFlight: 2 * GB))),   // overshoots a rounded size
      "99%")

check("tmp emptying as the file moves into the cache does not go backwards",
      pct(DownloadMath.fraction(
          expected: GB,
          start: .init(cache: 0, inFlight: 0),
          now:   .init(cache: 900_000_000, inFlight: 0))),
      "90%")

print("\nthrottling")
var lastPct = -1
var lastMB: Int64 = -1
check("first tick emits",
      String(DownloadMath.shouldEmit(fraction: 0.10, bytes: 100, lastPercent: &lastPct, lastMegabytes: &lastMB)),
      "true")
check("same whole percent stays quiet",
      String(DownloadMath.shouldEmit(fraction: 0.104, bytes: 100, lastPercent: &lastPct, lastMegabytes: &lastMB)),
      "false")
check("next whole percent emits",
      String(DownloadMath.shouldEmit(fraction: 0.11, bytes: 100, lastPercent: &lastPct, lastMegabytes: &lastMB)),
      "true")
check("with no fraction, a new megabyte emits",
      String(DownloadMath.shouldEmit(fraction: nil, bytes: 5_000_000, lastPercent: &lastPct, lastMegabytes: &lastMB)),
      "true")
check("with no fraction, the same megabyte stays quiet",
      String(DownloadMath.shouldEmit(fraction: nil, bytes: 5_400_000, lastPercent: &lastPct, lastMegabytes: &lastMB)),
      "false")

print("\npresence — receipt AND files")

// SHIPPED 2026-08-24: a size threshold alone. Cancel leaves partial bytes on
// purpose so a restart resumes, so a stop at 60% read as "Ready on this iPhone".
check("a download stopped at 60% is NOT a model",
      String(DownloadMath.isPresent(hasReceipt: false, bytesInCache: 600_000_000, expected: GB)),
      "false")
// The bug before that one: a UserDefaults flag alone kept claiming a model iOS
// had purged from Caches.
check("a receipt for files iOS purged is NOT a model",
      String(DownloadMath.isPresent(hasReceipt: true, bytesInCache: 0, expected: GB)),
      "false")
check("receipt plus files is a model",
      String(DownloadMath.isPresent(hasReceipt: true, bytesInCache: 980_000_000, expected: GB)),
      "true")
check("a rounded catalogue size still passes",
      String(DownloadMath.isPresent(hasReceipt: true, bytesInCache: 680_000_000, expected: 700_000_000)),
      "true")

print("\n\(checks - failures)/\(checks) passed")
if failures > 0 {
    print("\(failures) FAILED\n")
    exit(1)
}
print("")
