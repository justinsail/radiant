// The fit thresholds decide whether a Download button is offered at all, so
// they get the same treatment as the download math: assertions, not a phone.
import { ramNeededGB, fitOf, FITS_WELL, FITS_TIGHT, FITS_NO } from '../src/mobile/fit.js'
let pass = 0, fail = 0
const is = (name, got, want) => {
  if (got === want) { pass++; return }
  fail++; console.log(`  FAIL ${name}: got ${got}, wanted ${want}`)
}
const GB = 1e9
// An iPhone 17 Pro Max reports roughly 6 GB available to one app of its 12.
const BIG = 6 * GB
// A 6 GB iPhone gives an app roughly 3.
const SMALL = 3 * GB

is('0.66 GB on a big phone', fitOf(0.66, BIG), FITS_WELL)
is('0.66 GB on a small phone', fitOf(0.66, SMALL), FITS_WELL)
is('3.49 GB on a big phone', fitOf(3.49, BIG), FITS_WELL)
is('3.49 GB on a small phone', fitOf(3.49, SMALL), FITS_NO)
is('4.62 GB on a big phone is the tight band', fitOf(4.62, BIG), FITS_TIGHT)
is('5.6 GB is past a big phone', fitOf(5.6, BIG), FITS_NO)
is('12.1 GB never fits a phone', fitOf(12.1, BIG), FITS_NO)
is('2.43 GB on a small phone', fitOf(2.43, SMALL), FITS_NO)
is('2.2 GB on a small phone is the tight band', fitOf(2.2, SMALL), FITS_TIGHT)
// No budget yet = no claim. Showing "runs well" before the phone has answered
// would be a guess presented as a measurement.
is('unknown budget makes no claim', fitOf(3.0, 0), null)
is('unknown size makes no claim', fitOf(0, BIG), null)
// The overhead constant must not vanish, or tiny models look free.
is('overhead is never zero', ramNeededGB(0) > 0.3, true)
// Same shape as the Mac's, so the two apps agree.
is('need grows with size', ramNeededGB(4) > ramNeededGB(2), true)

// ⚠️ THE CASE THAT PROVED THE OLD FORMULA WRONG. Measured on Tony's iPhone 17
// Pro Max: the app's memory ceiling is 3.54 GB (physical is 12.26 — iOS caps
// what one app may use). Ministral 3 3B is 2.78 GB of weights and Locally runs
// it on that exact phone, so anything that reports "won't run" here is wrong.
// The Mac's formula, copied over, did exactly that.
const TONYS_PHONE = 3.54e9
is('Ministral 3 3B is not refused on a 12 GB iPhone',
  fitOf(2.78, TONYS_PHONE) === FITS_NO, false)
is('Ministral 3 3B is honestly called tight there',
  fitOf(2.78, TONYS_PHONE), FITS_TIGHT)
is('a small model is still comfortable there',
  fitOf(0.66, TONYS_PHONE), FITS_WELL)
// And the ceiling really is a ceiling: gpt-oss 20B cannot run on any phone.
is('gpt-oss 20B is still refused', fitOf(12.1, TONYS_PHONE), FITS_NO)

// ⚠️ ONE VOCABULARY, TWO APPS. Tony: "we should standardize the naming
// conventions." Both apps must read their words from src/fit.js; a local copy
// in either is how they drifted apart the first time.
import { readFileSync } from 'node:fs'
const mac = readFileSync('src/components/Settings.jsx', 'utf8')
const phone = readFileSync('src/mobile/fit.js', 'utf8')
is('the Mac imports the shared words', mac.includes("from '../fit.js'"), true)
is('the phone imports the shared words', phone.includes("from '../fit.js'"), true)
for (const dead of ['tight fit', 'too big', 'runs well here']) {
  is(`the Mac no longer hard-codes "${dead}"`, mac.includes(`'${dead}'`), false)
}
is('neither app redefines the labels',
  (mac + phone).includes("FIT_LABEL = {"), false)

console.log(`${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
