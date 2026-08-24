import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'

// macOS GUI apps (launched from Finder/Dock) don't inherit the shell PATH, so a
// bare `spawn('ollama')` fails with ENOENT even though `ollama` works in a
// terminal. Resolve the real binary and give spawned processes an augmented PATH.
const EXTRA_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', path.join(os.homedir(), '.local/bin')]

export const SPAWN_ENV = { ...process.env, PATH: [...EXTRA_DIRS, process.env.PATH || ''].filter(Boolean).join(':') }

// ⚠️ EVERY SPAWNED TOOL NEEDS THIS, NOT JUST OLLAMA. The Hermes relay called
// bare spawn('hermes') and died with ENOENT for every user who launched Radiant
// from the Dock, while working perfectly from a terminal — which is exactly how
// it got tested. Resolve through here, and pass SPAWN_ENV.
const cache = new Map()
export function resolveBin (name, envVar) {
  if (cache.has(name)) return cache.get(name)
  const set = v => { cache.set(name, v); return v }
  if (envVar && process.env[envVar] && fs.existsSync(process.env[envVar])) return set(process.env[envVar])
  for (const d of EXTRA_DIRS) { const p = path.join(d, name); if (fs.existsSync(p)) return set(p) }
  try {
    const p = execSync(`command -v ${name}`, { env: SPAWN_ENV, encoding: 'utf8' }).trim()
    if (p && fs.existsSync(p)) return set(p)
  } catch {}
  return set(name) // last resort; ENOENTs if genuinely not installed
}

export const ollamaBin = () => resolveBin('ollama', 'OLLAMA_BIN')
export const hermesBin = () => resolveBin('hermes', 'HERMES_BIN')
