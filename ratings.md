# Star System Ratings

## Gold Standards
<!-- 5-star outputs live here permanently. Read this section before building in
     an area that already has one — it is the bar for that area. -->

_None yet._

## Rating Log

### 2026-08-24 — Radiant for iPhone (progress relay, accessibility, chat streaming, model sheet) — ★★★ (round 1)
- **Feedback:** Weak on **UI/UX** and **Functionality**; code quality and requirements fit are not the problem.
- **Feedback:** No splash screen and no branding — the launch screen is still **Capacitor's own logo** on white, untouched since 14 Jul, with no dark variant. The app opens cold straight into a model list with no greeting and no explanation of what it is.
- **Feedback:** Downloads still cannot be cancelled; the design loop stopped at 4–6/10 and the current build was never scored.
- **The bar for 5 stars is App Store ready** — could be submitted and pass review: polish, edge cases, accessibility and error states all real.
- **Plan:** Three tracks, run together at Tony's direction: (1) first impression — real Radiant launch screen in both appearances, and a first run that greets and explains; (2) download cancel, then resume, then background transfer; (3) an honest critic pass on the current build, then fix what it finds.

### 2026-08-24 — Radiant for iPhone (brand lockup, download indicator, progress) — ★★★ (round 2)
- **Feedback:** "overall visual quality is sound, but very boring and uninspiring. I wanted visually stunning and this is not that. look at some apps that have won apple design awards."
- **Feedback:** Direction chosen: **Gentler Streak / Any Distance** — luminous gradients, generous motion, everything breathes. Not the dark-data-tool look, not playful-tactile.
- **Feedback:** **Go distinctive** — willing to leave standard iOS behind for custom surfaces, own type treatment, brand throughout. Explicitly accepts losing the "looks like Settings" property.
- **Root cause, named:** the phone UI's own spec says "the way to win a blind side-by-side against Apple's own apps is to remove brand, not add it", and every critic round scored it on closeness to Settings. Correct and forgettable was the brief working as designed. The brief is now the opposite.
- **Plan:** Rebuild launch + first run as one continuous animated moment — living aurora field, breathing halo, staggered entrance, launch PNG as frame one so the static-to-live handoff is invisible. Model list, chat and download screen come after.

### 2026-08-24 — Radiant for iPhone (home screen, history, themes, providers) — ★★★★ (round 3)
- **Feedback:** Up from 3. "text size isnt changing" — it never had: the setting wrote a variable no rule read, and two separate probes fought over the real one. Fixed and measured.
- **Tweaks needed:** **Models & downloading** — "the models dont seem to be most current. check the models that Locally offer and other ios local model coding apps."
- **What keeps it from 5:** **Missing Mac parity** — agents, subscription sign-in, usage meters. The features that make it the real Radiant rather than a local chat app.
- **Plan:** Refresh the catalogue against what MLX can actually run today, then take Mac parity in order: usage meters, subscription sign-in (paste + device-code flows that work on iOS), agents.

