import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'

// macOS GUI apps (launched from Finder/Dock) don't inherit the shell PATH, so a
// bare `spawn('ollama')` fails with ENOENT even though `ollama` works in a
// terminal. Resolve the real binary and give spawned processes an augmented PATH.
const EXTRA_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', path.join(os.homedir(), '.local/bin')]

export const SPAWN_ENV = { ...process.env, PATH: [...EXTRA_DIRS, process.env.PATH || ''].filter(Boolean).join(':') }

let cached
export function ollamaBin () {
  if (cached) return cached
  if (process.env.OLLAMA_BIN && fs.existsSync(process.env.OLLAMA_BIN)) return (cached = process.env.OLLAMA_BIN)
  for (const d of EXTRA_DIRS) { const p = path.join(d, 'ollama'); if (fs.existsSync(p)) return (cached = p) }
  try { const p = execSync('command -v ollama', { env: SPAWN_ENV, encoding: 'utf8' }).trim(); if (p && fs.existsSync(p)) return (cached = p) } catch {}
  return (cached = 'ollama') // last resort; will ENOENT if truly not installed
}
