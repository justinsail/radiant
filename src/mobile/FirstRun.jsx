/**
 * FirstRun — the first five seconds of Radiant, and the only screen that is
 * allowed to be a piece of design rather than a piece of iOS.
 *
 * THE HANDOFF IS THE TRICK. The launch image (Splash.imageset, built by
 * scripts/make-ios-splash.py) is frame one of this screen: same ground, same two
 * glows, same lockup at the same size. iOS shows the
 * PNG, this mounts underneath it, and the entrance plays from exactly where the
 * static image left off. There is no seam, so the app looks alive from the
 * instant the icon is tapped.
 *
 * NOTHING LOOPS. Tony: "no animation should run continually." Every animation
 * here runs once and holds its final frame; the glows settle and the halo does
 * not breathe. A phone about to run a language model gets no permanent rAF.
 */
import React from 'react'
import usePress from './usePress.js'
import { BrandMark } from './BrandSpinner.jsx'
import wordUrl from '../assets/brand/radiant-wordmark.png'

export default function FirstRun ({ onChooseModel, onConnectMac }) {
  const choose = usePress(() => onChooseModel?.(), { label: 'Choose a model' })
  const mac = usePress(() => onConnectMac?.(), { label: 'Connect to a Mac instead' })

  return (
    <div className="rx-cover rx-intro">
      {/* Ground, in layers. Three glows, aria-hidden: this is
          atmosphere, and a screen reader announcing it would be noise. */}
      <div className="rx-intro-sky" aria-hidden="true">
        <span className="rx-intro-glow rx-intro-glow-a" />
        <span className="rx-intro-glow rx-intro-glow-b" />
        <span className="rx-intro-glow rx-intro-glow-c" />
      </div>

      <div className="rx-intro-stage">
        <span className="rx-intro-mark">
          <span className="rx-intro-halo" aria-hidden="true" />
          {/* masked, so it follows the theme like every other mark */}
          <BrandMark size={132} className="rx-intro-mark-img" />
        </span>

        {/* Artwork, not type — the wordmark is the logo, not a font choice. But
            masked rather than drawn, so it takes the theme color the way the
            Mac's .wordmark does. Its alpha IS the letterforms, so the shapes
            are still exactly the brand's. */}
        <span
          className="rx-intro-word"
          role="img"
          aria-label="Radiant"
          style={{
            WebkitMask: `url(${wordUrl}) center / contain no-repeat`,
            mask: `url(${wordUrl}) center / contain no-repeat`
          }}
        />

        {/* Say what the product IS, first. The old line ("A model that lives on
            your iPhone. No account. No network once it's here.") described a
            single model as if the app were one, and led with what it does not
            do — no account, no network — which tells a first-time reader
            nothing about what they are holding. */}
        <p className="rx-intro-line">
          Open AI models, running on your iPhone.
        </p>
        <p className="rx-intro-sub">
          Download one and talk to it anywhere. It keeps working with no signal,
          and nothing you type leaves this device.
        </p>
        <p className="rx-intro-byline">
          Radiant is a Templeton&nbsp;Technologies product.
        </p>
      </div>

      <div className="rx-intro-actions">
        <button
          type="button"
          className={'rx-intro-cta' + choose.className}
          {...choose.handlers}
        >
          Choose a model
        </button>
        <button
          type="button"
          className={'rx-intro-alt' + mac.className}
          {...mac.handlers}
        >
          Connect to a Mac instead
        </button>
      </div>
    </div>
  )
}

export { FirstRun }
