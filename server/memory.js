import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { RADIANT_DIR } from './config.js'

// Persistent, cross-session memory: durable facts the agent remembers about the
// user and their projects. Distilled after turns, injected (a small slice) into
// the system prompt on future turns.
const MEM_PATH = path.join(RADIANT_DIR, 'memory.json')

function load () {
  try { return JSON.parse(fs.readFileSync(MEM_PATH, 'utf8')) } catch { return { facts: [] } }
}
function save (m) {
  try { fs.mkdirSync(RADIANT_DIR, { recursive: true }); fs.writeFileSync(MEM_PATH, JSON.stringify(m, null, 2)) } catch {}
}

export function listFacts () { return load().facts }

export function addFacts (facts, cwd) {
  const m = load()
  const seen = new Set(m.facts.map(f => f.text.toLowerCase().trim()))
  let added = 0
  for (const raw of facts || []) {
    const text = String(raw).replace(/^[-*•\d.\s]+/, '').trim()
    if (text.length < 4 || text.length > 300 || /^none\b/i.test(text) || seen.has(text.toLowerCase())) continue
    m.facts.push({ id: 'm-' + crypto.randomBytes(3).toString('hex'), text, cwd: cwd || null, createdAt: new Date().toISOString() })
    seen.add(text.toLowerCase())
    added++
  }
  if (m.facts.length > 300) m.facts = m.facts.slice(-300)
  if (added) save(m)
  return added
}

export function deleteFact (id) { const m = load(); m.facts = m.facts.filter(f => f.id !== id); save(m) }
export function clearFacts () { save({ facts: [] }) }
export function addFactManual (text) { return addFacts([text], null) }

// return a small set of the most relevant facts for a query
export function relevantFacts (query, cwd, limit = 15) {
  const facts = load().facts
  if (!facts.length) return []
  const words = new Set(String(query || '').toLowerCase().split(/\W+/).filter(w => w.length > 3))
  const scored = facts.map(f => {
    let score = (f.cwd && cwd && f.cwd === cwd) ? 1 : 0
    const ft = f.text.toLowerCase()
    for (const w of words) if (ft.includes(w)) score += 2
    return { f, score }
  })
  const matched = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score)
  // if nothing matched, still surface the most recent facts (memory should show up)
  const chosen = matched.length ? matched : scored.slice(-limit).map(s => ({ f: s.f, score: 0 }))
  return chosen.slice(0, limit).map(s => s.f.text)
}
