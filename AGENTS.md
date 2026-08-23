# Radiant — read this first, every turn

Radiant is Tony's own coding harness: an Electron app wrapping a local node
server (`server/index.js`, port 5834) and a React UI (`src/`). It is a public,
FSL-licensed repo, signed and notarized, and it auto-updates from GitHub
Releases. Work on `master`.

## Written is not shipped

**Every change closes all three of these, in the same turn:**

1. **Git** — committed with a real message, and pushed. Tony runs the packaged
   app, not the dev server, and other agents work from other checkouts. An
   uncommitted fix looks exactly like no fix: on 2026-08-22 six corrected files
   sat in the working tree while he tested the release and reported the bug as
   still broken.
2. **The in-app Read me** — the `GUIDE` array in `src/components/Settings.jsx`
   (Settings → "Read me"). Standing rule from Tony: *"you MUST update that
   readme when features are added or changed. end users deserve that."* Write it
   for someone using the app: what they can now do, plain language, US spelling.
3. **Linear** — team **The Templeton Group** (TG), project **Radiant**. Ship
   something → its issue goes to Done, or create one already Done. Spot a
   problem you are not fixing → file it.

Run the objective half and fix whatever it flags:

```bash
node scripts/ship-check.mjs
```

It verifies committed / pushed / Read-me-kept-current / tagged. Or hand the
whole job to the **`ship-sync`** agent (runs on Haiku, cheap) — it loops until
all three are actually verified rather than merely attempted.

## Releasing

A fix Tony cannot run is not shipped. When a change is user-facing:

```bash
npm version <next> --no-git-tag-version && npm run build
git add -A && git commit -F <message-file>
npx electron-builder --mac          # signs + notarizes; takes a few minutes
git tag v<next> && git push origin master --tags
gh release create v<next> release/Radiant-<next>-arm64.dmg \
  release/Radiant-<next>-arm64.dmg.blockmap \
  release/Radiant-<next>-arm64-mac.zip \
  release/Radiant-<next>-arm64-mac.zip.blockmap \
  release/latest-mac.yml --title "v<next>" --notes-file <notes>
```

All five assets matter — `latest-mac.yml` is what the in-app updater reads.
Confirm with `spctl -a -vv -t install release/mac-arm64/Radiant.app` ("accepted,
Notarized Developer ID"). Commit messages and release notes with apostrophes or
backticks break shell heredocs — write them to a file and use `-F` / `--notes-file`.

## Sharp edges

- **Two icons, not one.** `build/icon.png` + `build/icon.icns` is the Mac Dock
  icon and copies AiOS's geometry (body 0.896 of canvas, swirl 0.678, measured
  off `~/Projects/aios-claude/mac/icon-1024.png`). The web/iOS set —
  `public/favicon.png`, `public/apple-touch-icon.png`, `public/icon-{192,512}.png`,
  `src/assets/logo-mark.png` — is **full-bleed and signed off; do not change it.**
  `scripts/make-icon.py` writes only the Mac icon unless you pass `--web`.
- **Colors live under `:root[data-mode=…]`**, applied from the config. A device
  that has not signed in never gets a config, so anything that renders before
  auth must work with the mode restored from localStorage in `index.html`.
- **Remote devices** authenticate with a token (Settings → Devices & sharing),
  held in an httpOnly cookie so a phone stays signed in. Loopback is always
  allowed, so test the gate over the Tailscale address, never `127.0.0.1`.
- **`~/.radiant/config.json` has one writer, the server.** Window geometry lives
  in `~/.radiant/window-state.json` precisely to avoid racing it.
- The updater stages a download in `~/Library/Caches/radiant-updater/pending`
  and installs it on quit. It must always hold the newest release or the user
  gets walked up one version at a time.
