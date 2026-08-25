#!/usr/bin/env bash
# ⚠️ THE STATION THE GAUNTLET NEVER HAD. Starts the harness, drives the real
# phone UI in real Chrome, asserts what a person would see, and tears down.
set -uo pipefail
cd "$(dirname "$0")/.."
PORT=5877
npx vite --port "$PORT" --strictPort >/tmp/radiant-harness.log 2>&1 &
VITE=$!
trap 'kill $VITE 2>/dev/null' EXIT
for _ in $(seq 1 40); do curl -sf -o /dev/null "http://localhost:$PORT/harness/" && break; sleep 0.5; done
HARNESS_URL="http://localhost:$PORT/harness/" node scripts/test-ui.mjs
