import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ollamaBin, SPAWN_ENV } from './ollama.js'

const execFileP = promisify(execFile)

// Quantization targets Ollama's `create -q` actually supports (F16, Q4_K_S,
// Q4_K_M, Q8_0). factor ≈ resulting size as a fraction of the F16 source.
export const QUANT_TYPES = [
  { id: 'q4_K_S', label: 'Q4_K_S', note: 'smallest — good quality', factor: 0.28 },
  { id: 'q4_K_M', label: 'Q4_K_M', note: 'best balance — recommended', factor: 0.30 },
  { id: 'q8_0', label: 'Q8_0', note: 'near-lossless, larger', factor: 0.53 }
]

// which installed models can actually be quantized: only full-precision ones
// (Ollama refuses to requantize an already-quantized model)
export async function quantizableModels (localModels) {
  const out = []
  for (const m of localModels) {
    try {
      const { stdout } = await execFileP(ollamaBin(), ['show', m.name], { timeout: 8000, env: SPAWN_ENV })
      const q = (stdout.match(/quantization\s+(\S+)/i) || [])[1] || ''
      if (/^(f16|f32|bf16)$/i.test(q)) out.push({ name: m.name, sizeGB: m.sizeGB, quant: q })
    } catch {}
  }
  return out
}

// run `ollama create <target> -q <quant>` from a source model, streaming lines
export function runQuantize ({ source, target, quant }, onLine) {
  return new Promise((resolve, reject) => {
    if (!/^[\w.:\/-]+$/.test(source) || !/^[\w.:\/-]+$/.test(target)) return reject(new Error('bad model name'))
    if (!QUANT_TYPES.find(q => q.id === quant)) return reject(new Error('unknown quant type'))
    const modelfile = path.join(os.tmpdir(), `radiant-quant-${process.pid}-${Date.now()}.modelfile`)
    fs.writeFileSync(modelfile, `FROM ${source}\n`)
    const proc = spawn(ollamaBin(), ['create', target, '-q', quant, '-f', modelfile], { env: SPAWN_ENV })
    let err = ''
    let last = ''
    const strip = s => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\r\x00-\x08\x0e-\x1f]/g, '').trim()
    const feed = buf => buf.toString().split('\n').forEach(raw => {
      const l = strip(raw)
      if (l && l !== last) { last = l; onLine(l) } // dedupe repeated spinner lines
    })
    proc.stdout.on('data', feed)
    proc.stderr.on('data', d => { err += d.toString(); feed(d) })
    proc.on('error', e => { fs.unlink(modelfile, () => {}); reject(e) })
    proc.on('close', code => {
      fs.unlink(modelfile, () => {})
      if (code === 0) resolve()
      else reject(new Error(err.trim().split('\n').pop() || `ollama exited ${code}`))
    })
  })
}
