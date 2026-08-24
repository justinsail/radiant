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
// need = 4.62*1.15+0.45 = 5.76, which is past 95% of 6 — barely, and the
// barely is the point: this is the band where a load succeeds and then dies
// the moment the conversation grows a KV cache.
is('4.62 GB on a big phone', fitOf(4.62, BIG), FITS_NO)
is('4.0 GB on a big phone is the tight band', fitOf(4.0, BIG), FITS_TIGHT)
is('12.1 GB never fits a phone', fitOf(12.1, BIG), FITS_NO)
is('2.43 GB on a small phone', fitOf(2.43, SMALL), FITS_NO)
is('1.75 GB on a small phone is the tight band', fitOf(1.75, SMALL), FITS_TIGHT)
// No budget yet = no claim. Showing "runs well" before the phone has answered
// would be a guess presented as a measurement.
is('unknown budget makes no claim', fitOf(3.0, 0), null)
is('unknown size makes no claim', fitOf(0, BIG), null)
// The overhead constant must not vanish, or tiny models look free.
is('overhead is never zero', ramNeededGB(0) > 0.4, true)
// Same shape as the Mac's, so the two apps agree.
is('need grows with size', ramNeededGB(4) > ramNeededGB(2), true)

console.log(`${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
