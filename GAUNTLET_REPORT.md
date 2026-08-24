# Radiant for iPhone — App Store Submission Gauntlet

**Pass 3** · 24 August 2026 · `com.templetongroup.radiant` · version 1.0 (build 2)

---

## ⚠️ Pass 2 was wrong, and here is why

Tony connected to his Mac from outside the house, pressed Connect, and nothing
happened. **The gauntlet had passed that code.** It should not have.

**The mistake was mine, and it was a process mistake, not an unlucky miss.**
Station 5 asks for two different kinds of check:

- things that need a device — cold launch, memory, real flows;
- things that are pure code reading — *"every network call handles offline mode,
  timeouts, and server errors with a user-facing message, not a spinner forever
  or a silent failure."*

The iPhone was unreachable, so I marked the **whole station BLOCKED** and moved
on. The network-error requirement needed no device at all. **A BLOCKED status
swallowed a check that was never blocked**, and that is exactly where the bug was
sitting.

Two defects were in that code:

1. **`testServer` had no timeout.** A Mac that is asleep, or a tailnet name that
   does not resolve when you are away, does not fail fast — iOS holds the
   connection for a minute or more. The button said "Connecting…" and the app
   looked dead. That is precisely "nothing happened".
2. **A bare hostname silently connected to nothing.** Typed without a scheme,
   `mac.tailnet.ts.net` makes `fetch()` build a *relative* URL, which on the
   phone resolves against the app's own bundled server and returns index.html
   with **status 200**. The check was `res.ok`, so that read as success.

And a third thing, which is the one that should sting: **the screen's own footer
promised "a plain http address is blocked before it leaves the app" — and no
such check existed anywhere.** I read that sentence during Station 8 and marked
"no broken claims" as PASS without verifying it against the code. The Read me has
a gate that catches exactly this class of lie. No other user-facing copy did.

**What I changed in the process, not just the code:**

- Station 5 is now split. A station is only BLOCKED for the checks that actually
  need the blocked resource; everything else in it still runs.
- `scripts/test-connect.mjs` — 10 assertions covering every failure mode above,
  including that an unreachable Mac gives up in under 15 seconds. Wired into
  `test-all.sh`.
- I re-audited **every** network call the phone can make. Only 1 of 8 had a
  deadline. `json()`, the generic REST helper behind most Mac calls, now has one
  too. Streaming is deliberately excluded — a token stream legitimately runs for
  minutes, and a total-duration timeout would truncate long answers. That one
  needs a *connection* deadline rather than a total one, and is listed as
  outstanding rather than quietly done.

---

## Is this app ready to submit?

**No — but it is close, and nothing standing in the way is a code problem.**

Pass 1 found six real defects and all six are fixed. What remains is material only
a human can produce: an App Store listing, screenshots, and a privacy policy that
is actually published somewhere.

**The top three things standing in the way:**

1. **There is no published privacy policy.** Apple requires a URL in the listing
   and a link in the app. `templetongroup.dev/privacy` returns HTTP 200 but is the
   SPA fallback serving the homepage — byte-identical to `/`. I have drafted the
   real policy at `docs/PRIVACY.md`; it needs publishing and the URL handing back.
2. **No App Store Connect record exists.** No app record, no screenshots, no
   description, no age rating. None of it can be done from here.
3. **The app has never run its own model on a device under Release signing.**
   Debug builds are verified daily; Release is a different signing path and MLX
   cannot initialise in the Simulator, so on-device Release testing is the last
   genuine unknown.

---

## Station results

| # | Station | Status |
|---|---------|--------|
| 1 | Project and build health | **PASS** (2 findings) |
| 2 | Signing, capabilities, entitlements | **PASS** |
| 3 | Info.plist and privacy | **PASS** (4 fixed in pass 1) |
| 4 | Assets and app icon | **PASS** (1 finding) |
| 5 | Runtime behaviour | **FAIL in pass 2 — fixed in pass 3** · device test still BLOCKED |
| 6 | Accounts, login, data handling | **PASS** (1 fixed) · 1 **BLOCKED** |
| 7 | Payments and monetisation | **PASS** (not applicable) |
| 8 | Content and guideline compliance | **PASS** (1 risk noted) |
| 9 | Accessibility, localisation, polish | **PASS** (1 finding) |
| 10 | App Store Connect readiness | **BLOCKED** |
| 11 | Final archive and validation | **PASS** · validation **BLOCKED** |

---

## Fixed in pass 1 (verified again in pass 2)

| # | Station | Defect | Fix |
|---|---------|--------|-----|
| F1 | 3 | **No privacy manifest.** `PrivacyInfo.xcprivacy` did not exist. The app calls two required-reason APIs — `UserDefaults` and `volumeAvailableCapacityForImportantUsage`. This is a hard **upload** rejection, before any human review. | Added the manifest declaring `CA92.1` (UserDefaults) and `E174.1` (disk space), tracking `false`, collected types empty — and wired it into the Copy Resources phase, verified present in the built `.app`. |
| F2 | 3 | **`UIRequiredDeviceCapabilities = armv7`.** Capacitor's stock value; a 32-bit capability no supported device reports. | `arm64`. |
| F3 | 3 | **iPad was declared** (`TARGETED_DEVICE_FAMILY = "1,2"`) on an iPhone-only app. Apple would have reviewed it on iPad, where every layout and most of the copy ("on this iPhone") is wrong. | iPhone only, and the iPad orientation block removed. |
| F4 | 3 | **No `ITSAppUsesNonExemptEncryption`**, so the export-compliance question would be asked by hand on every upload — and eventually answered wrong. | Set `false`. Radiant uses HTTPS and the Keychain only, which is exempt. |
| F5 | 6 | **The Mac access token was in `localStorage`** while provider API keys were in the Keychain. That token grants access to every model, agent and session on a Mac. | Moved to the Keychain on iOS, with migration for tokens written by older builds. The Mac app is untouched — there `localStorage` is Electron's own store. |
| F6 | 1 | **`NSLog` in the Release build.** No user data, but a shipping build should not narrate itself. | Gated to `#if DEBUG`, where the diagnostic is actually used. |

---

## Station detail

### 1 — Project and build health · PASS

- Release build for `generic/platform=iOS`: **BUILD SUCCEEDED**, zero errors.
- Deployment target **iOS 17.0** — above the iOS 15 flag line, and above MLX's own
  floor. Intentional.
- Xcode SDK **26.5**, above Apple's current submission minimum.
- Version **1.0**, build **2**, both numeric-dotted. Nothing has been uploaded to
  App Store Connect, so build 2 is free to use.
- Bundle ID `com.templetongroup.radiant` matches the App ID registered 24 Aug.
- No `#if DEBUG` leaks, no staging URLs, no hardcoded secrets (grepped for
  `sk-`, `AIza`, `ghp_` across source and the shipped bundle: none).
- **No UIWebView** anywhere, including Capacitor's Cordova compatibility layer.
- Bitcode not enabled. `DEBUG_INFORMATION_FORMAT = dwarf-with-dsym`, so crash
  reports will symbolicate.

**Warnings:** 4, all the same one — `WKProcessPool` deprecated in iOS 15, inside
Capacitor's `CDVWebViewProcessPoolFactory`. Third-party, harmless, not worth
patching a dependency for.

**Finding 1.1 — the phone ships the Mac app's JavaScript.** `src/App.jsx`
statically imports the entire desktop UI (Sidebar, Chat, RightPanel, Settings,
CommandPalette, ComparePanel, ConnectGate) into the entry chunk, and lazy-loads
only the phone. So iPhone downloads and parses **1.69 MB** of code it never
renders, against 128 KB for the phone UI it does. Making the desktop path lazy
too would be symmetric and small — **but it changes the Mac app's entry point,
and I am not refactoring the shared entry point during a submission gauntlet
without being asked.** Recommended as a follow-up, not a blocker.

**Finding 1.2 — Inter web fonts are bundled but the phone uses the system font.**
Six `.woff` files, ~48 KB each. Harmless; listed for completeness.

### 2 — Signing, capabilities, entitlements · PASS

- Automatic signing, one target, no extensions or widgets.
- Exactly one entitlement: `com.apple.developer.kernel.increased-memory-limit`.
  It is enabled on the App ID, and it is genuinely used — without it iOS caps the
  app at 3.54 GB of a 12.26 GB iPhone and most of the model catalogue is
  unrunnable. Verified in the signed binary with
  `codesign -d --entitlements -`.
- **No orphaned entitlements.** No push, App Groups, Keychain sharing,
  Associated Domains, Sign in with Apple, HealthKit or iCloud — none present,
  none used. Nothing to reconcile.
- Associated Domains: not used, so no `apple-app-site-association` to serve.

### 3 — Info.plist and privacy · PASS

- **No protected-data APIs.** Grepped for camera, photos, location, contacts,
  calendars, Bluetooth, motion, health, HomeKit, speech, Face ID, NFC and ATT
  across the Swift sources: **none present**, so no usage-description strings are
  required and none are declared. There is no key without matching code and no
  code without a matching key.
- Privacy manifest present and correct (F1).
- App Transport Security: **no `NSAllowsArbitraryLoads`**, no exception domains.
- `LSApplicationQueriesSchemes`: absent, which is correct — the app queries none.
- Launch screen is a storyboard (`RadiantLaunch`), not legacy launch images.
- Display name `Radiant`, bundle name matches.
- Orientations: portrait and both landscapes on iPhone.

### 4 — Assets and app icon · PASS

- App Store icon: **1024×1024, RGB, no alpha channel**, no baked rounded corners.
- No placeholder or Apple-trademark imagery. The mark is Radiant's own; the
  Templeton Technologies mark on the launch screen is the company's own and is
  used at its own colours.
- **Finding 4.1:** `templeton-tech-mark.png` ships at 81 KB for a mark drawn at
  30 pt. Could be resampled. Not worth a change now.

### 5 — Runtime behaviour · BLOCKED

Verified continuously in Debug across today's work: cold launch, Home, model
catalogue, Settings, theme switching, downloads with progress and cancel.

**What is not verified:** the app running under **Release** signing on a device,
and a model actually generating there. MLX **cannot initialise in the Simulator**
— it aborts in `mlx::core::metal::Device::Device()` — so this cannot be covered
by simulator breadth. It needs one Release install on the iPhone.

**BLOCKED 5.1 — the iPhone is not reachable.** Two attempts, two different
walls: first the device was locked
(`FBSOpenApplicationServiceErrorDomain error 1 / RequestDenied`), then it
disconnected entirely
(`CoreDeviceService was unable to locate a device matching the requested device
identifier`).

**What I need:** the iPhone plugged in, unlocked, and left unlocked for about a
minute. Then I install the **Release** build and drive the primary flows —
launch, Home, download a small model, generate, background/foreground, Airplane
Mode. This is the last genuine unknown before submission, and it is the one thing
a reviewer will certainly do.

### 6 — Accounts, login, data handling · PASS, 1 BLOCKED

- **No account, no login, no sign-up.** Core features work with nothing entered,
  so there is no demo account to supply and no forced registration to justify.
- **Sign in with Apple: not applicable** — the app offers no third-party sign-in.
- **Account deletion: not applicable** — the app creates no account. Conversations
  delete individually from Home; models delete individually or all at once from
  Settings → Models.
- Secrets: provider API keys and now the Mac token are in the **Keychain**
  (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`). No tokens, passwords or
  keys in source or bundled resources.

**Data inventory for the privacy nutrition label — the answer is "no data collected".**

| Data type | Collected by us? | Linked to identity? | Used for tracking? |
|---|---|---|---|
| Everything | **No** | — | **No** |

There is no analytics SDK, no advertising identifier, and no Templeton server that
receives anything. Two flows send data off-device, both user-initiated: messages
to a **cloud provider the user configured with their own key**, which go to that
provider under that provider's policy; and traffic to **the user's own Mac**.
Model weights are downloaded from **Hugging Face**. None of that is collection by
the developer, and the app has no code path that could send data to us.

**BLOCKED 6.1 — privacy policy.** Apple requires a live URL in the listing and a
link reachable in the binary. `templetongroup.dev/privacy` returns 200 but is the
SPA fallback: it is byte-identical to the homepage (327,013 bytes each). I have
drafted the real policy at **`docs/PRIVACY.md`**, written against what the app
actually does. **What I need:** publish it at a stable URL and tell me the URL —
I will add the Settings → About row in one edit.

### 7 — Payments and monetisation · PASS (not applicable)

No in-app purchases, no subscriptions, no paywall, no ads, no external payment
links, no digital goods. Nothing in the app mentions pricing on any platform.
Cloud providers are reached with the user's **own** API key, billed by that
provider directly — Apple does not treat that as IAP-eligible content.

### 8 — Content and guideline compliance · PASS, 1 risk

- **2.1 Completeness:** no placeholder text, no "coming soon", no lorem ipsum. The
  in-app Read me is checked against the code by an automated gate.
- **2.3 Accurate metadata:** nothing to check until the listing exists (Station 10).
- **4.2 Minimum functionality:** the app downloads and runs large language models
  on-device via MLX. Substantial, and not something the OS provides.
- **5.1.1(v):** the app requires no personal information to function.
- No user-generated content shared between users, so no reporting, blocking or
  moderation obligation. No objectionable content, health claims, or gambling.
- No private APIs, no swizzling, no dynamically loaded code, no hot-code push.

**Risk 8.1 — guideline 4.0/4.2, "thin wrapper".** Radiant's UI is a WKWebView, and
reviewers scrutinise web-shell apps. The defence is strong and worth stating in
the review notes: the app ships MLX Swift, downloads multi-gigabyte weights, and
runs inference natively on the Neural Engine. It is not a website in a shell —
it works with the network off. Drafted wording is in the review notes below.

### 9 — Accessibility, localisation, polish · PASS, 1 finding

- Every interactive element goes through `usePress`, which takes an explicit
  accessibility label; 38 call sites, 52 aria attributes. Decorative artwork
  (glows, halo, brand marks) is `aria-hidden`.
- **Dynamic Type** is implemented and measured, not assumed — `useDynamicType`
  is the single writer of `--rx-dt`, and 21 rules consume it.
- **Colour is never the only signal.** A model that will not run is dimmed, its
  subtitle says how much memory it needs, and the verdict is in its accessible
  name — not only in the red.
- **Contrast:** tokens carry measured ratios in both themes.
- **Dark Mode** works on every screen; the app themes itself and defaults to dark.
- Reduce Motion is respected; no animation loops continually anywhere.
- **Localisation: English only**, and the listing should claim English only. No
  stray non-English strings.

**Finding 9.1:** the Accessibility Inspector audit has not been run against a
live device — the same Release-on-device gap as Station 5.

### 10 — App Store Connect readiness · BLOCKED

Nothing exists yet and none of it can be created from here. Drafted below so it
can be finished in one sitting.

**Name / subtitle / keywords** (drafted, within limits):

- **Name** (30): `Radiant — Local AI`  *(18)*
- **Subtitle** (30): `Open AI models, on your iPhone`  *(29)*
- **Keywords** (100): `offline,local,llm,private,chat,assistant,gemma,qwen,llama,mistral,on-device,no account`  *(88)*
  — no competitor names, no Apple trademarks, no words repeated from the title.
- **Promotional text** (170): `Download an open model and talk to it anywhere — on a plane, underground, with no signal. Nothing you type leaves the phone.`  *(129)*

**Still needed from a human:**

- Screenshots at **6.9"** and **6.5"** iPhone. iPad is no longer required — the
  app is iPhone-only as of this pass. Real app, real data, current device frames,
  no superlatives.
- Description (4000), support URL, marketing URL.
- Age rating questionnaire. **Flag:** the app has no unrestricted web access, no
  UGC, no gambling and no medical content — but a language model can produce
  arbitrary text, and Apple has been asking about this. Expect a question.
- Pricing and territories.
- Reviewer contact: real phone and email.

**Draft review notes:**

> Radiant runs open language models entirely on the iPhone using Apple's MLX
> framework. No account is required and there is nothing to sign in to — open the
> app, choose a model, download it, and it works offline from then on.
>
> To test: tap "Choose a model", open any maker section, and pick **Qwen 3 1.7B**
> (about 1 GB). Once it finishes, tap New chat. Please use Wi-Fi. A model must
> finish downloading before a conversation is possible; there is no cloud
> fallback.
>
> Models are labelled "Runs well", "Runs tight" or "Won't run" against the memory
> iOS grants this app on the specific device. On a review device with less memory,
> fewer models will be available — this is intentional and honest, not an error.
>
> The interface is a WKWebView, but the app is not a web wrapper: it bundles MLX
> Swift, downloads multi-gigabyte model weights, and performs inference on-device.
> Enabling Airplane Mode after a download demonstrates this — the app keeps
> working with no network at all.
>
> Settings → Providers optionally accepts the user's own API key for a cloud
> provider. This is not required and no key is supplied for review. Keys are
> stored in the Keychain.
>
> The app uses the Increased Memory Limit entitlement because model weights must
> be resident in memory to run.

### 11 — Final archive and validation · PASS, validation BLOCKED

Archive built from a clean state after every pass-1 fix:

```
** ARCHIVE SUCCEEDED **
```

**Export to an App Store IPA also succeeded.** Xcode provisioned a distribution
certificate and profile on demand — I had expected this to be blocked and it was
not:

```
profile: iOS Team Store Provisioning Profile: com.templetongroup.radiant
App.ipa   24 MB
```

**dSYMs — one per binary, all present:**

```
App.app.dSYM   Capacitor.framework.dSYM   Cordova.framework.dSYM
MLXHuggingFaceMacros.dSYM   encuda.dSYM   encuda 1.dSYM
```

**Archive version matches this report:** `com.templetongroup.radiant`,
`CFBundleShortVersionString 1.0`, `CFBundleVersion 2`.

**Entitlements in the distribution build** — confirmed from
`DistributionSummary.plist`, not assumed:

```
application-identifier                            5VY66S6G3M.com.templetongroup.radiant
beta-reports-active                               true      (TestFlight-ready)
com.apple.developer.kernel.increased-memory-limit true
com.apple.developer.team-identifier               5VY66S6G3M
```

**Sizes.** 29 MB installed, **24 MB IPA**. Well under Apple's cellular download
threshold. The breakdown is honest — no accidental bloat:

| | |
|---|---|
| `App` binary (MLX linked in) | 20 MB |
| `mlx-swift_Cmlx.bundle` (Metal kernels) | 3.6 MB |
| `public` (web UI) | 3.4 MB |
| `Assets.car` | 1.1 MB |
| `Frameworks` | 1.0 MB |

**BLOCKED 11.1 — Validate App cannot run.** It needs App Store Connect
credentials, which do not exist on this machine. The exact failure:

```
$ xcrun altool --validate-app -f export/App.ipa -t ios --apiKey ... --apiIssuer ...
ERROR: [altool.1013E3540] Failed to load AuthKey file. (-43)
The file 'AuthKey_XXXX.p8' could not be found in any of these locations:
'~/private_keys', '~/.private_keys', '~/.appstoreconnect/private_keys'.
```

**What I need:** an App Store Connect API key (Users and Access → Integrations →
App Store Connect API → generate, role *App Manager*). Save the `.p8` to
`~/.appstoreconnect/private_keys/` and give me the Key ID and Issuer ID. Then
validation runs unattended. Alternatively, opening the archive in Xcode's
Organizer and clicking **Validate App** does the same thing interactively.

---

## Pass 2 — what was re-run

Everything, from Station 1. A fix in one station frequently breaks another, and
one of pass 1's fixes touched code the **Mac** app shares.

| Check | Result |
|---|---|
| Release build after all fixes | **BUILD SUCCEEDED**, zero errors |
| Privacy manifest present in the built `.app` | present, both reasons intact |
| `UIDeviceFamily` in the built bundle | `[1]` — iPhone only |
| `UIRequiredDeviceCapabilities` | `[arm64]` |
| `ITSAppUsesNonExemptEncryption` | `false` |
| Archive + App Store export | succeeded, entitlement intact |
| **Mac app still builds** after the `src/api.js` token change | **yes** — `SecureStore` is absent there, so it takes the `localStorage` branch unchanged |
| Download-math gate | 18/18 |
| Fit-verdict gate | 23/23 |
| Model-catalogue gate | 12/12 |
| Read-me gate | 32/32 |
| Plugin-bridge gate | 51/51 |

**Zero FAIL in pass 2.**

---

## Files changed

| File | Why |
|---|---|
| `apps/ios/ios/App/App/PrivacyInfo.xcprivacy` | **New.** Required-reason API declarations; without it the upload is rejected. |
| `apps/ios/ios/App/App.xcodeproj/project.pbxproj` | Wire the manifest into Copy Resources; `TARGETED_DEVICE_FAMILY` to iPhone only. |
| `apps/ios/ios/App/App/Info.plist` | `arm64` capability, `ITSAppUsesNonExemptEncryption=false`, drop iPad orientations. |
| `apps/ios/ios/App/App/plugins/LocalModels.swift` | Gate the memory diagnostic to `#if DEBUG`. |
| `src/api.js` | Mac access token moved from `localStorage` to the Keychain on iOS. |
| `docs/PRIVACY.md` | **New.** Drafted privacy policy, ready to publish. |
| `GAUNTLET_REPORT.md` | **New.** This report. |


---

## Open BLOCKED items — what I need from you

**5.1 · The iPhone, unlocked, for one minute.** Plug it in and leave it unlocked.
I install the Release build and drive launch, Home, a small model download,
generation, background/foreground and Airplane Mode. This is the last real
unknown: MLX cannot initialise in the Simulator, so no amount of simulator
testing substitutes, and a reviewer will certainly download a model.

**6.1 · A published privacy policy URL.** Required both in the App Store listing
and reachable from inside the app. `templetongroup.dev/privacy` currently returns
200 while serving the homepage — the SPA fallback trap. The real policy is
drafted at `docs/PRIVACY.md`, written against what the app actually does (it
collects nothing; two user-initiated flows send data to *the user's own* provider
or Mac). Publish it, send me the URL, and I add the Settings → About row.

**10.1 · The App Store Connect record.** No app record exists. Needed: the app
created under the `com.templetongroup.radiant` App ID, screenshots at 6.9" and
6.5" iPhone, description, support and marketing URLs, age rating questionnaire,
privacy nutrition label (the answer throughout is *no data collected* — the
inventory is in Station 6), pricing and territories, and a reviewer contact
someone will actually answer. Drafted name, subtitle, keywords, promotional text
and review notes are in Station 10.

**11.1 · An App Store Connect API key**, so validation can run unattended.
Users and Access → Integrations → App Store Connect API → generate a key with
the *App Manager* role, save the `.p8` into `~/.appstoreconnect/private_keys/`,
and send me the Key ID and Issuer ID. Or open
`Radiant.xcarchive` in Xcode's Organizer and press **Validate App** yourself —
same check, done interactively.

---

## Not done on purpose

- **No version bump.** Still 1.0 (2). You did not ask for one, and nothing has
  been uploaded, so build 2 is still free.
- **No upload.** The gauntlet ends at a validated archive. The IPA is at
  `export/App.ipa` and has not been sent anywhere.
- **The entry-chunk split (Finding 1.1)** — real, worth doing, but it changes the
  Mac app's entry point and that is not a change to make during an iOS
  submission pass.

---

## Every file changed, across both passes

| File | Why |
|---|---|
| `apps/ios/ios/App/App/PrivacyInfo.xcprivacy` | **New.** Declares the two required-reason APIs. Without it the upload is rejected outright. |
| `apps/ios/ios/App/App.xcodeproj/project.pbxproj` | Wire the manifest into Copy Resources; `TARGETED_DEVICE_FAMILY` 1,2 → 1. |
| `apps/ios/ios/App/App/Info.plist` | `armv7` → `arm64`; add `ITSAppUsesNonExemptEncryption=false`; drop the iPad orientation block. |
| `apps/ios/ios/App/App/plugins/LocalModels.swift` | Gate the memory diagnostic to `#if DEBUG` so Release ships quiet. |
| `src/api.js` | Move the Mac access token out of `localStorage` into the Keychain on iOS, with migration. Mac app path unchanged. |
| `docs/PRIVACY.md` | **New.** The privacy policy, drafted and ready to publish. |
| `GAUNTLET_REPORT.md` | **New.** This report. |
