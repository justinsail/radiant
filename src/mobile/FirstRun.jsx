/**
 * FirstRun — a full-screen cover, not a sheet: there is nothing behind it worth
 * showing and it cannot be dismissed until a choice is made.
 *
 * No wordmark. Apple apps do not print their own name in their chrome, and
 * deleting the Montserrat lockup is what buys the gauge its meaning: the icon
 * and the title carry identity, and the iris carries state.
 */
import React from 'react'
import Gauge from './Gauge.jsx'
import usePress from './usePress.js'

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
        <Gauge size={128} state="absent" />
        <h1 className="rx-large-title" style={{ margin: 0 }}>Radiant</h1>
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
