# Radiant — App Store Connect fields

Everything below is drafted to Apple's character limits and checked against what
the app actually does. Counts are in brackets.

---

## App information

**Bundle ID** — `com.templetongroup.radiant`
**SKU** — `radiant-ios-1`
**Primary language** — English (U.S.)
**Category** — Primary: **Productivity**. Secondary: **Developer Tools**.

> Not "Utilities": the app's job is getting work done in a conversation.
> Developer Tools as secondary because the provider/API-key audience lives there.

---

## Name and subtitle

**App name** (30 max)
```
Radiant - Local AI Chat
```
*(23)*

> "Radiant — Local AI" was already taken — App Store names are globally unique
> and a name can be held by a record that never shipped, so it is invisible.
> This one is accurate, which matters more than it sounds: guideline 2.3 rejects
> a name that promises something the app does not do. It is a local AI chat app,
> and that is what it now says.
>
> ⚠️ THE NAME ON THE PHONE IS UNAFFECTED. The Home screen icon reads **Radiant**,
> from CFBundleDisplayName in the app bundle. Only the store listing changed.

**Subtitle** (30 max)
```
Open AI models, on your iPhone
```
*(29)*

---

## Promotional text (170 max — editable without a new build)

```
Download an open model and talk to it anywhere — on a plane, underground, with
no signal. Nothing you send it leaves your phone.
```
*(129)*

---

## Description (4000 max)

```
Radiant runs open AI models directly on your iPhone.

Download a model once and it works anywhere — on a plane, underground, with no
signal at all. Nothing you send it leaves the device, because there is nowhere
for it to go: no account, no sign-in, and no server of ours in between.

CHOOSE FROM 44 MODELS

Models from Google, Meta, Mistral, Microsoft, IBM, Alibaba, NVIDIA, DeepSeek,
Liquid AI, Hugging Face and more — grouped by who made them, from 0.2 GB up.

Every model is labeled for YOUR iPhone before you download it: Runs well, Runs
tight, or Won't run. That verdict is measured against the memory iOS actually
grants an app on your specific device, not a guess from the spec sheet — so you
know before you spend the download.

BUILT FOR THE PHONE

· Conversations are kept and named, so you can pick one up later
· Switch models mid-conversation without losing what you were saying
· Twelve color themes, four appearance modes, and your own text size
· Full Dynamic Type and VoiceOver support

BRING YOUR OWN KEY, OPTIONALLY

If you want a model too large for any phone, add your own API key for Anthropic,
OpenAI, OpenRouter, xAI, Nous, DeepSeek, Kimi, GLM, Groq or Mistral. Keys are
held in the iOS Keychain. The line under every chat title tells you which model
is answering and where it runs, so you always know whether you are on-device or
online.

Radiant is a Templeton Technologies product.
```

---

## Keywords (100 max, comma-separated, no spaces after commas)

```
offline,private,llm,assistant,coding,code,gemma,qwen,llama,mistral,on-device,gpt
```
*(79)*

> ⚠️ "local", "AI" and "chat" were REMOVED because they are now in the app name,
> and Apple already indexes every word of the name — repeating them wastes
> characters that could buy another search term.
>
> "coding" and "code" earn the developer search traffic WITHOUT claiming it in
> the name. Keywords are search intent; the name is a claim about the app, and
> only one of those is held to guideline 2.3. The iPhone app is not a coding
> assistant — that is the Mac app.

---

## URLs

**Support URL** — `https://www.templetongroup.dev/showcase/radiant/`
**Marketing URL** — `https://www.templetongroup.dev/showcase/radiant/`
**Privacy Policy URL** —
```
https://www.templetongroup.dev/showcase/radiant/privacy.html
```

> ⚠️ **The `.html` is load-bearing.** `templetongroup.dev` answers 200 for unknown
> paths and serves the homepage — the extensionless `/privacy` returns 327 KB of
> homepage while the `.html` returns the real policy. Verified by content.

---

## Privacy nutrition label

**Answer: "Data Not Collected" for every category.**

There is no analytics SDK, no advertising identifier, and no Templeton server
that receives anything. Two flows send data off-device, both user-initiated and
both going to the user's own service, not to us:

| Flow | Goes to | Ours? |
|---|---|---|
| Messages to a cloud model the user configured | That provider, under their policy | No |
| Model weight downloads | Hugging Face | No |

Apple does not count either as collection by the developer.

---

## Age rating

Expect **4+** on the questionnaire as answered below, but see the flag.

| Question | Answer |
|---|---|
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Sexual content or nudity | None |
| Profanity or crude humour | None |
| Alcohol, tobacco, drug use | None |
| Simulated gambling | None |
| Horror/fear themes | None |
| Medical/treatment information | None |
| Unrestricted web access | **No** |
| User-generated content | **No** |

> ⚠️ **The one to think about.** A language model can produce arbitrary text.
> Apple has been asking about this for AI apps. If the questionnaire offers an
> AI-generated-content question, answer it honestly — it may push the rating to
> 12+ or 17+. Do not answer "no" to make the rating lower.

---

## Review notes

```
Radiant runs open language models entirely on the iPhone using Apple's MLX
framework. No account is required and there is nothing to sign in to — open the
app, choose a model, download it, and it works offline from then on.

TO TEST: tap "Choose a model", open any maker section, and pick Qwen 3 1.7B
(about 1 GB). Please use Wi-Fi. When it finishes, tap New chat. A model must
finish downloading before a conversation is possible; there is no cloud
fallback.

Models are labeled "Runs well", "Runs tight" or "Won't run" against the memory
iOS grants this app on the specific device. On a review device with less memory,
fewer models will be available — this is intentional and honest, not an error.

The interface is a WKWebView, but the app is not a web wrapper: it bundles MLX
Swift, downloads multi-gigabyte model weights, and performs inference on-device.
Enabling Airplane Mode after a download demonstrates this — the app keeps working
with no network at all.

Settings > Providers optionally accepts the user's own API key for a cloud
provider. This is not required, and no key is supplied for review. Keys are
stored in the iOS Keychain.

The app uses the Increased Memory Limit entitlement because model weights must be
resident in memory to run.
```

**Demo account** — not applicable; the app has no login.
**Contact** — a real phone number and email that will be answered.

---

## Screenshots

Required: **6.9"** iPhone. 6.5" is accepted if provided. iPad is NOT required —
the app is iPhone-only (`TARGETED_DEVICE_FAMILY = 1`).

Suggested five, in order:

1. **Home** — the lockup, greeting, New chat
2. **Models** — a maker shelf open, showing the Runs well / Runs tight labels
3. **A chat** — a real reply, with the model name and origin in the title
4. **Settings** — themes and text size
5. **Device panel** — the memory readout above the model list

⚠️ Real app, real data. No mockups, no invented UI, no pricing claims or
"#1 app" captions.

---

## Pricing

Decide: free, or paid. Territories: all, unless there is a reason not to.
