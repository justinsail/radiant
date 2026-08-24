/**
 * What this iPhone is — the panel above the model list.
 *
 * Tony: "on the model selector screen it should have an area right above the
 * models list that shows the specs of the current phone its installed on."
 * The Mac app has had exactly this for years (Settings.jsx `.spec-card`): the
 * chip, then memory · cores · OS · free disk, then a line explaining what the
 * fit badges mean on THIS machine. Same three parts here.
 *
 * ⚠️ IT EXISTS TO EXPLAIN THE VERDICTS, not to show off the hardware. Without
 * it, "Won't run" on a phone the user knows is powerful reads as the app being
 * wrong. The line that does that work is the second number: iOS gives one app
 * only part of the device's memory, and until you say so, a 12 GB iPhone
 * refusing a 4 GB model looks like a bug.
 */
import React, { useEffect, useState } from 'react'
import { ramNeededGB } from './fit.js'

const LM = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.LocalModels : null)
const GB = 1e9
const gb = n => `${(n / GB).toFixed(n < 10 * GB ? 1 : 0)} GB`

export default function DeviceSpecs ({ freeBytes }) {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    let alive = true
    const lm = LM()
    if (!lm?.deviceInfo) return
    lm.deviceInfo()
      .then(d => { if (alive) setInfo(d) })
      .catch(() => { if (alive) setInfo(null) })
    return () => { alive = false }
  }, [])

  // No panel at all rather than a panel of blanks: on anything that is not the
  // iPhone app there is nothing true to put here.
  if (!info) return null

  const budget = info.ramAvailable || 0
  // The largest model that would still be comfortable, stated as a size the
  // user can compare against the list right below.
  const comfortable = budget ? (budget * 0.75 / 1e9 - 0.45) / 1.15 : 0

  return (
    <div className="rx-specs">
      <div className="rx-specs-name">{info.name}</div>
      <div className="rx-specs-line">
        {gb(info.ramTotal)} memory
        {info.cores ? ` · ${info.cores} cores` : ''}
        {info.osVersion ? ` · iOS ${info.osVersion}` : ''}
        {typeof freeBytes === 'number' ? ` · ${gb(freeBytes)} free` : ''}
      </div>
      {budget > 0 && (
        <div className="rx-specs-note">
          {/* The number nobody expects, and the reason the labels look strict.
              Said plainly, because a user who does not know this reads a
              refusal as a bug in Radiant rather than a limit in iOS. */}
          iOS gives one app about <b>{gb(budget)}</b> of that. Models up to
          roughly <b>{comfortable.toFixed(1)} GB</b> <span className="rx-fit is-well">run well</span> here;
          bigger ones <span className="rx-fit is-tight">run tight</span>, then{' '}
          <span className="rx-fit is-no">won't run</span>.
        </div>
      )}
    </div>
  )
}

export { DeviceSpecs, ramNeededGB }
