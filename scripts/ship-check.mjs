#!/usr/bin/env node
// Is this change actually shipped, or just written?
//
// ⚠️ WRITTEN IS NOT SHIPPED. On 2026-08-22 six fixed files sat uncommitted
// while Tony tested the released app and reported the bug as unfixed. Twice
// more the same day, a feature changed behavior without the in-app Read me
// being told. This script is the objective half of that check — it answers the
// questions a script CAN answer, so the agent running the loop doesn't have to
// take anyone's word for it.
//
//   node scripts/ship-check.mjs [--json]
//
// Exit code 0 = everything it can verify is clean, 1 = something is outstanding.
// Linear is deliberately NOT checked here (no API key in the repo); the
// ship-sync agent covers that half.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()
const tryGit = (...a) => { try { return git(...a) } catch { return '' } }

// Code whose behavior a user could notice. Docs and this script don't count.
const USER_FACING = /^(src|server|electron|public|build)\//
const GUIDE_FILE = 'src/components/Settings.jsx'

const checks = []
const add = (id, ok, detail, fix) => checks.push({ id, ok, detail, fix })

// ── 1. Is everything committed? ──────────────────────────────────────────────
const dirty = tryGit('status', '--porcelain').split('\n').filter(Boolean)
add(
  'committed',
  dirty.length === 0,
  dirty.length ? `${dirty.length} uncommitted file(s): ${dirty.slice(0, 6).map(l => l.slice(3)).join(', ')}${dirty.length > 6 ? '…' : ''}` : 'working tree clean',
  'git add -A && git commit'
)

// ── 2. Is it pushed? ─────────────────────────────────────────────────────────
const branch = tryGit('rev-parse', '--abbrev-ref', 'HEAD')
const ahead = tryGit('rev-list', '--count', `origin/${branch}..HEAD`)
add(
  'pushed',
  ahead === '' || ahead === '0',
  ahead && ahead !== '0' ? `${ahead} commit(s) not on origin/${branch}` : `origin/${branch} up to date`,
  `git push origin ${branch}`
)

// ── 3. Does the in-app Read me know about it? ────────────────────────────────
// Compare against the last released tag: if user-facing code moved since then
// and the GUIDE array never did, the Read me is behind.
const lastTag = tryGit('describe', '--tags', '--abbrev=0')
if (!lastTag) {
  add('readme', true, 'no tags yet — nothing to compare against', '')
} else {
  const changed = tryGit('diff', '--name-only', `${lastTag}..HEAD`).split('\n').filter(Boolean)
  const codeChanged = changed.filter(f => USER_FACING.test(f) && f !== GUIDE_FILE)
  const guideDiff = tryGit('diff', `${lastTag}..HEAD`, '--', GUIDE_FILE)
  // a GUIDE entry is a line like:   ['Title', 'Body'],
  const guideTouched = guideDiff.split('\n').some(l => /^[+-]\s*\['/.test(l))
  add(
    'readme',
    codeChanged.length === 0 || guideTouched,
    codeChanged.length === 0
      ? `no user-facing code changed since ${lastTag}`
      : guideTouched
        ? `Read me updated alongside ${codeChanged.length} changed file(s)`
        : `${codeChanged.length} user-facing file(s) changed since ${lastTag} but the Read me (GUIDE in ${GUIDE_FILE}) was not touched`,
    `add or amend an entry in the GUIDE array in ${GUIDE_FILE}`
  )
}

// ── 4. Does the released version match what's committed? ─────────────────────
const pkgVersion = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
const tagForPkg = tryGit('tag', '-l', `v${pkgVersion}`)
add(
  'tagged',
  Boolean(tagForPkg),
  tagForPkg ? `v${pkgVersion} is tagged` : `package.json is ${pkgVersion} but there is no v${pkgVersion} tag`,
  `npm version <next> --no-git-tag-version && npm run build && git commit && git tag v${pkgVersion}`
)

// ── report ───────────────────────────────────────────────────────────────────
const failed = checks.filter(c => !c.ok)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: failed.length === 0, version: pkgVersion, branch, checks }, null, 2))
} else {
  for (const c of checks) console.log(`  ${c.ok ? 'OK  ' : 'TODO'}  ${c.id.padEnd(10)} ${c.detail}`)
  if (failed.length) {
    console.log('\noutstanding:')
    for (const c of failed) console.log(`  - ${c.id}: ${c.fix}`)
  }
}
process.exit(failed.length ? 1 : 0)
