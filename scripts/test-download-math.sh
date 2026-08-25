#!/usr/bin/env bash
# Runs the download-path regression tests. Pure Swift, no Xcode project, no
# simulator, no device — because none of what broke ever needed one.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=apps/ios/ios/App/App/plugins/DownloadMath.swift
TEST=scripts/test-download-math.swift
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# concatenate: the test file is a script, so it cannot `import` a sibling
{ cat "$SRC"; grep -v '^#!' "$TEST"; } > "$TMP/all.swift"
swift "$TMP/all.swift"
