# Radiant

A local coding harness for your Mac: chat with coding agents across cloud and
local models, watch them work, and drive a real terminal — all in one window.

## Features

- **Agent chat** with streaming responses and visible model thinking
- **Any model, one history** — sessions store messages in a neutral format, so
  you can switch between Anthropic, OpenAI, OpenRouter, Ollama, and LM Studio
  mid-conversation
- **Agent tools** — the model can list/read/write/edit files and run shell
  commands in a per-session workspace folder, with an approval prompt before
  every command (toggle in Settings)
- **Activity panel** — live feed of every tool call and its output
- **Terminal panel** — a real login shell (node-pty + xterm.js) in the sidebar
- **Theming** — light/dark, six presets, or a fully custom accent: the whole
  palette derives from one OKLCH hue + chroma pair
- **API keys** stored locally in `~/.radiant/config.json` (mode 0600), never
  sent to the browser; local providers need no key
- **Custom providers** — add any OpenAI-compatible base URL (Groq, Mistral,
  Together, a remote Ollama box…)

## Run it

```bash
npm install
npm run dev        # server on :5834, UI on http://localhost:5833
```

Production-ish: `npm run build && npm start` serves the built UI from :5834.

## Layout

- `server/` — Express + WebSocket backend: provider streaming clients
  (`providers.js`), agent tools (`tools.js`), config/sessions (`config.js`)
- `src/` — React UI (Vite): chat, model picker, settings, activity feed,
  xterm terminal

OAuth sign-in to providers is not implemented yet; the provider registry has an
`auth` field so a device-code/OAuth flow can slot in later.
