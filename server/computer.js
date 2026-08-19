import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const execFileP = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// the compiled Swift helper; in the packaged app it's unpacked next to server/
function helperPath () {
  const candidates = [
    path.join(__dirname, '..', 'native', 'radiant-control'),
    path.join(process.resourcesPath || '', 'native', 'radiant-control')
  ]
  return candidates.find(p => { try { return fs.existsSync(p) } catch { return false } }) || candidates[0]
}

export function helperAvailable () {
  try { return fs.existsSync(helperPath()) } catch { return false }
}

async function ctl (...args) {
  const { stdout } = await execFileP(helperPath(), args.map(String), { timeout: 15000 })
  return stdout.trim()
}

// logical screen size in points — the coordinate space for clicks/screenshots
let cachedSize = null
export async function screenSize () {
  if (cachedSize) return cachedSize
  const out = await ctl('screensize')
  const [w, h] = out.split(/\s+/).map(Number)
  cachedSize = { width: w, height: h }
  return cachedSize
}

// capture the main display, normalized to point size, returned as base64 png.
// screencapture yields Retina pixels; we downscale to points so the model's
// click coordinates map 1:1 onto CGEvent points.
export async function screenshot () {
  const { width } = await screenSize()
  const tmp = path.join(os.tmpdir(), `radiant-shot-${process.pid}.png`)
  await execFileP('screencapture', ['-x', '-t', 'png', tmp], { timeout: 15000 })
  // downscale to logical width with sips (built in), keeping aspect
  await execFileP('sips', ['-Z', String(width), tmp], { timeout: 15000 }).catch(() => {})
  const data = fs.readFileSync(tmp)
  fs.unlink(tmp, () => {})
  return { dataB64: data.toString('base64'), mime: 'image/png' }
}

export const desktop = {
  screenshot,
  screenSize,
  move: (x, y) => ctl('move', x, y),
  click: (x, y, button = 'left') => ctl(button === 'right' ? 'rightclick' : 'click', x, y),
  doubleClick: (x, y) => ctl('doubleclick', x, y),
  drag: (x1, y1, x2, y2) => ctl('drag', x1, y1, x2, y2),
  scroll: (x, y, dy) => ctl('scroll', x, y, dy),
  type: text => ctl('type', text),
  key: spec => ctl('key', spec)
}
