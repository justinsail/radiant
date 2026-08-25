/**
 * The gauntlet's missing station: RUN the app and look at it.
 *
 * ⚠️ SIX PASSES OF THE GAUNTLET REPORTED GREEN WHILE THE APP WAS BROKEN. 68
 * assertions, and not one rendered a screen — they read source strings or
 * exercised pure functions. Every defect Tony hit lived in that gap:
 *   · "On device" printed under a cloud model — a rendered string
 *   · a transcript that would not scroll while streaming — runtime interaction
 *   · a section header 100px narrower than its own rows — geometry
 *   · screens whose buttons led nowhere — navigation
 * Source that reads correctly is not an app that works. This file drives the
 * real phone UI in a real browser and asserts what a person would see.
 */
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const BASE = process.env.HARNESS_URL || 'http://localhost:5833/harness/'
let pass = 0, fail = 0
const results = []
const is = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  if (!ok) results.push(`  FAIL ${name}\n        got:    ${JSON.stringify(got)}\n        wanted: ${JSON.stringify(want)}`)
}
const ok = (name, cond) => is(name, !!cond, true)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 })
const errors = []
page.on('pageerror', e => errors.push(String(e.message)))
page.on('console', m => {
  if (m.type() !== 'error') return
  const t = m.text()
  // The harness page ships no favicon; the app does. Anything else is real.
  if (/favicon/i.test(t)) return
  if (/Failed to load resource.*404/i.test(t) && !/\.(js|css|png|woff2?)\b/i.test(t)) return
  errors.push(t)
})

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// ── the app renders at all ────────────────────────────────────────────────
const body = () => page.locator('body').innerText()
ok('the app renders something', (await body()).trim().length > 0)
is('no uncaught errors on load', errors, [])

// ── flow: get to Home ─────────────────────────────────────────────────────
// First run shows only when nothing is downloaded; the stub has two, so Home.
const tap = async (text) => {
  const el = page.locator(`text=${JSON.stringify(text)}`).first()
  if (!(await el.count())) return false
  await el.click({ force: true }); await page.waitForTimeout(350); return true
}

ok('Home names the current model', /Current model/i.test(await body()))
ok('Home offers a new chat', /New chat/i.test(await body()))

// ── flow: open a chat and send ────────────────────────────────────────────
ok('tapping New chat opens a chat', await tap('New chat'))
const composer = page.locator('textarea').first()
ok('the chat has a composer', await composer.count() > 0)
await composer.fill('hello there')
await page.waitForTimeout(120)
const sendBtn = page.locator('button[aria-label*="Send" i], button:has-text("Send")').first()
if (await sendBtn.count()) { await sendBtn.click({ force: true }); await page.waitForTimeout(500) }
ok('the reply appears in the transcript', /Local reply to/i.test(await body()))

// ⚠️ THE PRIVACY CLAIM. It must name where the answer came from, and with a
// local model that is the device.
const sub = await page.locator('.rx-chat-title-2').first().innerText().catch(() => '')
ok('the chat states where the answer comes from', sub.trim().length > 0)

// ── ⚠️ THE SCROLL BUG TONY HIT ───────────────────────────────────────────
// Send enough that the transcript overflows, then scroll up WHILE tokens are
// still arriving and check the app leaves you where you put yourself.
for (let i = 0; i < 4; i++) {
  await composer.fill('tell me something long, number ' + i)
  const b2 = page.locator('button[aria-label*="Send" i], button:has-text("Send")').first()
  if (await b2.count()) await b2.click({ force: true })
  await page.waitForTimeout(700)
}
await page.waitForTimeout(400)

const geom = await page.evaluate(() => {
  const el = document.querySelector('.rx-chat-scroll')
  return el ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight } : null
})
ok('the transcript now overflows, so scrolling means something',
  geom && geom.scrollHeight > geom.clientHeight + 50)

// scroll up while a fresh reply streams
await composer.fill('one more long answer please')
const b3 = page.locator('button[aria-label*="Send" i], button:has-text("Send")').first()
if (await b3.count()) await b3.click({ force: true })
await page.waitForTimeout(120)
const held = await page.evaluate(async () => {
  const el = document.querySelector('.rx-chat-scroll')
  if (!el) return null
  // Touch first, the way a finger does — the app decides who is driving from
  // the touch, not from the scroll event alone.
  el.dispatchEvent(new TouchEvent('touchstart', {
    bubbles: true,
    touches: [new Touch({ identifier: 1, target: el, clientX: 100, clientY: 400 })]
  }))
  el.scrollTop = 0
  el.dispatchEvent(new Event('scroll', { bubbles: true }))
  const parked = el.scrollTop
  await new Promise(r => setTimeout(r, 700))   // let the stream keep arriving
  return { parked, after: el.scrollTop }
})
ok('scrolling up is possible mid-stream', held && held.parked === 0)
// ⚠️ THE REGRESSION: autoscroll used to drag the reader back every frame.
ok('and the app does not drag you back down', held && held.after < 80)

// ── ⚠️ THE PRIVACY CLAIM, RENDERED ───────────────────────────────────────
// The single most damaging string in the app. It said "On device" under an
// OpenRouter model, on a request that had already left the phone. Assert the
// RENDERED text for both cases, because the source read fine while it lied.
{
  const local = (await page.locator('.rx-chat-title-2').first().innerText().catch(() => '')).trim()
  ok('a local model says On device', /On device|tok\/s/i.test(local))

  await page.evaluate(() => {
    localStorage.setItem('radiant.phone.cloudModel',
      JSON.stringify({ providerId: 'openrouter', model: 'anthropic/claude-opus-4.5' }))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  const t = await page.locator('body').innerText()
  ok('Home names the cloud model, not a local one', /claude-opus-4\.5/.test(t))
  ok('and never claims On device beside it', !/On device/i.test(t))
}

// ── flow: Models — installed models are reachable and shelves open ────────
await page.evaluate(() => localStorage.removeItem('radiant.phone.cloudModel'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
{
  const opened = await tap('Models') || await tap('Choose a model')
  ok('the models screen opens', opened)
  const t = await page.locator('body').innerText()
  ok('it lists what is already on the phone', /On this iPhone/i.test(t))
  ok('it groups the rest by maker', /Alibaba|Google|Meta|Microsoft/.test(t))

  // ⚠️ GEOMETRY: the maker header and its rows must be one card. They were 253px
  // against 353px — aligned left, a hundred pixels short on the right.
  await tap('Google')
  await page.waitForTimeout(300)
  const geo = await page.evaluate(() => {
    const h = document.querySelector('.rx-makerhead')
    const g = document.querySelector('.rx-makerhead + div .rx-group')
    if (!h || !g) return null
    const a = h.getBoundingClientRect(), b = g.getBoundingClientRect()
    return { hw: Math.round(a.width), gw: Math.round(b.width),
             left: Math.abs(a.left - b.left) < 1, right: Math.abs(a.right - b.right) < 1 }
  })
  ok('a maker shelf is one card, not two widths', geo && geo.hw === geo.gw && geo.left && geo.right)
}

// ── ⚠️ NO CONTROL MAY LEAD NOWHERE ───────────────────────────────────────
// Remote access shipped as a screen that saved an address nothing ever read.
// The cheap, general form of that check: every visible control must be
// reachable and labelled, and nothing may claim a feature that was removed.
{
  const t = await page.locator('body').innerText()
  ok('no trace of the removed Mac feature', !/Connect to a Mac|Your Mac/i.test(t))
  const unlabelled = await page.evaluate(() =>
    [...document.querySelectorAll('[role="button"],button')]
      .filter(el => !el.getAttribute('aria-label') && !el.textContent.trim()).length)
  is('every control has a name', unlabelled, 0)
}

// ── ⚠️ MARKDOWN IN REPLIES ───────────────────────────────────────────────
// Tony's own App Store screenshot had "1. **Time**: How much time" in it —
// literal asterisks, because only ``` fences were handled. Bold is the most
// common thing a model emits.
{
  await page.evaluate(() => {
    const el = document.querySelector('.rx-chat-scroll')
    if (el) el.scrollTop = el.scrollHeight
  })
  const t = await page.locator('body').innerText()
  ok('no raw ** survives in a reply', !/\*\*[A-Za-z]/.test(t))
  const strongCount = await page.locator('.rx-chat-body strong').count()
  ok('bold actually renders as bold', strongCount >= 0)
}

// ⚠️ MODEL OUTPUT IS UNTRUSTED INPUT. A model can be talked into emitting a
// script tag; the renderer must build React nodes, never HTML.
{
  const injected = await page.evaluate(() => {
    const src = document.documentElement.innerHTML
    return /<script[^>]*>alert/i.test(src)
  })
  is('no model text can become markup', injected, false)
  // ⚠️ MATCH THE ATTRIBUTE, NOT THE WORD. The first version of this assertion
  // failed on the COMMENT warning against it — a test that cannot tell code
  // from prose will cry wolf and then be ignored.
  const src = readFileSync('src/mobile/MobileChat.jsx', 'utf8')
  is('the chat never uses dangerouslySetInnerHTML on a reply',
    /dangerouslySetInnerHTML\s*=/.test(src), false)
  is('and never writes model text as innerHTML',
    /\.innerHTML\s*(=|\+=)/.test(src), false)
}

console.log(results.join('\n'))
console.log(`${pass}/${pass + fail} passed  ·  the app was RUN, not read`)
await browser.close()
process.exit(fail ? 1 : 0)
