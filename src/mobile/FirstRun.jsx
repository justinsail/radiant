/**
 * FirstRun — a full-screen cover, not a sheet: there is nothing behind it worth
 * showing and it cannot be dismissed until a choice is made.
 *
 * THE BRAND GOES HERE, as pixels. This screen used to draw Gauge at 128pt and
 * set "Radiant" in the system font, on the argument that Apple apps do not
 * print their own name. Tony's call overrides that: this is his product and it
 * wears his logo. Gauge is the app's own iris — a STATUS object, thin-stroked
 * and gappy — and it is not the Radiant mark; the mark and the wordmark are
 * finished artwork from the marketing site, in src/assets/brand/. Use those
 * files. Do not re-draw, re-tint or re-set them in a font.
 */
import React from 'react'
import usePress from './usePress.js'
import markUrl from '../assets/brand/radiant-mark.png'
import wordUrl from '../assets/brand/radiant-wordmark.png'

export default function FirstRun ({ onChooseModel, onConnectMac }) {
  const choose = usePress(() => onChooseModel?.())
  const mac = usePress(() => onConnectMac?.())

  return (
    <div className="rx-cover">
      <div style={{
        flex: '1 1 auto',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        textAlign: 'center'
      }}>
        {/* The mark sits in the site's halo — its own light — which is what
            stops #5276B2 going flat against a near-black ground. */}
        <span className="rx-brand-halo">
          <img className="rx-brand-mark" src={markUrl} alt="" width={128} height={128} />
        </span>
        {/* The wordmark is artwork, not type: an <img> so it is the real logo
            and not whatever font happens to resolve. alt carries the name. */}
        <img className="rx-brand-word" src={wordUrl} alt="Radiant" />
        <p className="rx-body rx-l2" style={{ margin: 0, maxWidth: '30em' }}>
          Pick a model to download. It runs on this iPhone — no account, and no
          network once it&rsquo;s here.
        </p>
      </div>

      <div style={{ flex: '0 0 auto', paddingBottom: 12 }}>
        <button type="button" className={'rx-primary rx-pressable' + choose.className} {...choose.handlers}>
          Choose a model
        </button>
        <button
          type="button"
          className={'rx-plain-button' + mac.className}
          {...mac.handlers}
          style={{ marginTop: 8 }}
        >
          Connect to a Mac instead
        </button>
      </div>
    </div>
  )
}

export { FirstRun }
