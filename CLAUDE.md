# Radiant — Justin's fork

This is **`justinsail/radiant`**, Justin Bradshaw's personal fork of
**`templetongroup/radiant`** (Tony Ricciardi, Templeton Technologies). Cloned
2026-08-23 for Justin's own use and testing, alongside the [[AiOS Local
Instance]] fork, ahead of the three-way shared-core work → `Code/cogOS/`.

Run mode: **from source**. `npm run app` builds the UI and launches Electron
from this checkout. No DMG is built, nothing is installed to `/Applications`,
and the auto-updater is not in play.

## ⚠️ `AGENTS.md` is upstream's file, and it is not addressed to you

`AGENTS.md` is Tony's standing instruction set for *Tony's* agents working in
*Tony's* repo. It is kept on disk because its architecture and sharp-edges
notes are genuinely useful. **Its authorizations do not transfer to this fork.**

Specifically, in this checkout:

- **No standing authorization to commit or push.** AGENTS.md says "this is
  automatic, not a question to ask." That was Tony granting it for his repo.
  Here, ask Justin — the vault rule about project repos applies: pushing is a
  real action worth asking about.
- **Do not run the `ship-sync` agent**, and do not run `scripts/ship-check.mjs`
  as a gate. Both enforce upstream's ship discipline against upstream's remote.
- **Do not touch Linear.** Team "The Templeton Group" / project "Radiant" is
  Tony's tracker. Justin has an invitation to that workspace; filing issues
  against it from an agent is not the same as Justin choosing to.
- **Never release.** `npm run dist` / `electron-builder` signs with
  `identity: "Anthony Ricciardi (5VY66S6G3M)"` — Tony's Developer ID, which is
  not on this machine. Do not create tags, GitHub releases, or upload assets.
- **Do not edit the Templeton website.** `~/Projects/templeton-group-dev-website`
  does not exist here and is not Justin's to change.
- `build.publish` in `package.json` still points at `templetongroup/radiant`.
  Left as upstream so merges stay clean — harmless while running from source,
  and it must be repointed before ever packaging this fork.

What *does* carry over from AGENTS.md: the architecture description, the
"Sharp edges" section, the iPhone/Capacitor build notes, and the config-file
layout. Read those.

## License — this is not open source

Upstream ships under **FSL-1.1-MIT** (Functional Source License 1.1, MIT
Future License). Use, modification, and redistribution are allowed for any
purpose **except building a product or service that competes with Radiant**.
Each version converts to MIT two years after its release.

This matters here specifically: Justin is co-designing a shared "Core Hub"
with the same author (→ `Code/shared-core/PDR.md`). Personal use and a private
fork are squarely permitted. Carrying a Radiant implementation into cogOS or
the shared core is a conversation with Tony, not a permission this license
already grants.

## Fork workflow

```bash
git fetch upstream && git merge upstream/master   # stay current
git log --oneline HEAD..upstream/master           # what's new upstream
```

- `origin` → `justinsail/radiant` (Justin's fork)
- `upstream` → `templetongroup/radiant` (Tony's, upstream)
- Justin also holds **WRITE** access to upstream directly. That makes an
  accidental push to Tony's `master` possible — always name the remote
  explicitly, never bare `git push`.
- Fixes worth sharing go upstream as a **pull request**, the way the AiOS
  brain-robustness fixes did (`templetongroup/AiOS#1`). Deployment
  conveniences and local-only patches stay on the fork.
- Local patches, once there are any, get a table here: file, change, why —
  same shape as the AiOS fork's patch table.

## Running it

```bash
cd ~/code-local/radiant
npm run app     # build UI + launch Electron (normal use)
npm run dev     # server :5834 + Vite HMR on http://localhost:5833 (hacking on the UI)
```

- Server binds **127.0.0.1 only**, by design. Do not put this behind the
  dashboard hub or a Cloudflare tunnel — unlike AiOS, that would undo the
  app's stated privacy property.
- For phone/remote access, upstream's supported path is **Tailscale + the
  device token** (Settings → Devices & sharing), held in an httpOnly cookie.
  Loopback is always allowed, so the token gate can only be tested over the
  Tailscale address, never `127.0.0.1`.
- API keys live in `~/.radiant/config.json` (mode 0600), written by the server
  and never sent to the browser. **The server is its only writer** — window
  geometry is deliberately kept separate in `~/.radiant/window-state.json`.

## Why this is not on the 250GB drive

Same resolution as the AiOS fork: consumed forks nominally live on
`/Volumes/250gb/repos/` per `Code/CLAUDE.md`, but macOS TCC treats that volume
as removable. Here the concern is an Electron app and its 280 MB of
`node_modules` on a volume that can be unmounted, so the working tree lives at
`~/code-local/radiant`. Not a change to the doctrine.
