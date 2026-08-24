/**
 * FirstRun — the first five seconds of Radiant, and the only screen that is
 * allowed to be a piece of design rather than a piece of iOS.
 *
 * THE HANDOFF IS THE TRICK. The launch image (Splash.imageset, built by
 * scripts/make-ios-splash.py) is frame one of this screen: same ground, same two
 * glows, same constellation file, same lockup at the same size. iOS shows the
 * PNG, this mounts underneath it, and the entrance plays from exactly where the
 * static image left off. There is no seam, so the app looks alive from the
 * instant the icon is tapped.
 *
 * NOTHING LOOPS. Tony: "no animation should run continually." Every animation
 * here runs once and holds its final frame — the field is a pre-rendered PNG
 * rather than a canvas, the glows settle, the halo does not breathe. A phone
 * about to run a language model does not get a permanent rAF.
 */
import React from 'react'
import usePress from './usePress.js'
import markUrl from '../assets/brand/radiant-mark.png'
import wordUrl from '../assets/brand/radiant-wordmark.png'
import fieldUrl from '../assets/brand/aurora-field.png'

export default function FirstRun ({ onChooseModel, onConnectMac }) {
  const choose = usePress(() => onChooseModel?.(), { label: 'Choose a model' })
  const mac = usePress(() => onConnectMac?.(), { label: 'Connect to a Mac instead' })

  return (
    <div className="rx-cover rx-intro">
      {/* Ground, in layers. Three glows and the stars, all aria-hidden: this is
          atmosphere, and a screen reader announcing it would be noise. */}
      <div className="rx-intro-sky" aria-hidden="true">
        <span className="rx-intro-glow rx-intro-glow-a" />
        <span className="rx-intro-glow rx-intro-glow-b" />
        <span className="rx-intro-glow rx-intro-glow-c" />
        <span className="rx-intro-field" style={{ backgroundImage: `url(${fieldUrl})` }} />
      </div>

      <div className="rx-intro-stage">
        <span className="rx-intro-mark">
          <span className="rx-intro-halo" aria-hidden="true" />
          <img src={markUrl} alt="" width={132} height={132} />
        </span>

        {/* artwork, not type — the wordmark is the logo, not a font choice */}
        <img className="rx-intro-word" src={wordUrl} alt="Radiant" />

        <p className="rx-intro-line">
          A model that lives on your iPhone.<br />
          No account. No network once it&rsquo;s here.
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
