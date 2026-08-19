import path from 'path'

// Browser control via Playwright driving the system Chrome (channel: 'chrome',
// so there's no bundled-chromium download). One shared browser + page per
// server; the agent sees the page through screenshots.

let pw = null
let browser = null
let context = null
let page = null

async function ensure () {
  if (page && !page.isClosed()) return page
  if (!pw) pw = (await import('playwright-core')).chromium
  if (!browser) {
    browser = await pw.launch({ channel: 'chrome', headless: false, args: ['--no-first-run', '--no-default-browser-check'] })
  }
  context = context || await browser.newContext({ viewport: { width: 1280, height: 800 } })
  page = await context.newPage()
  return page
}

export const browserAvailable = async () => {
  try {
    if (!pw) pw = (await import('playwright-core')).chromium
    return true
  } catch { return false }
}

async function shot (p) {
  const buf = await p.screenshot({ type: 'png' })
  return { dataB64: buf.toString('base64'), mime: 'image/png' }
}

export const web = {
  async navigate (url) {
    const p = await ensure()
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await p.waitForTimeout(600)
    return { url: p.url(), title: await p.title() }
  },
  async screenshot () {
    const p = await ensure()
    return shot(p)
  },
  async click (x, y) {
    const p = await ensure()
    await p.mouse.click(x, y)
    await p.waitForTimeout(400)
    return { ok: true }
  },
  async type (text) {
    const p = await ensure()
    await p.keyboard.type(text, { delay: 15 })
    return { ok: true }
  },
  async key (spec) {
    const p = await ensure()
    // map "cmd+c" -> "Meta+c", "return" -> "Enter"
    const norm = spec.split('+').map(s => {
      const k = s.trim().toLowerCase()
      return ({ cmd: 'Meta', command: 'Meta', ctrl: 'Control', control: 'Control', alt: 'Alt', option: 'Alt', shift: 'Shift', enter: 'Enter', return: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab', space: 'Space', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[k]) || (k.length === 1 ? k : s)
    }).join('+')
    await p.keyboard.press(norm)
    await p.waitForTimeout(300)
    return { ok: true }
  },
  async scroll (dy) {
    const p = await ensure()
    await p.mouse.wheel(0, -dy)
    await p.waitForTimeout(300)
    return { ok: true }
  },
  async readText () {
    const p = await ensure()
    const text = await p.evaluate(() => document.body.innerText.slice(0, 12000))
    return { url: p.url(), title: await p.title(), text }
  },
  async close () {
    try { await browser?.close() } catch {}
    browser = context = page = null
    return { ok: true }
  }
}
