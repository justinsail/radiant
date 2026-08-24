/**
 * StorageLine — a hairline strip above the home indicator on the root screen
 * only. One segment per downloaded model, sized against the whole disk.
 *
 * The gauge says the model is here; this says it weighs something. That pair is
 * the product argument, and no other AI app on the App Store shows either.
 *
 * It makes no claim it cannot support: if Device is unavailable there is no
 * disk total, and the whole strip hides rather than guessing.
 */
import React from 'react'
import { GB } from './useLocalModels.js'

const fmt = (bytes) => {
  const gb = bytes / GB
  if (gb <= 0) return '0 GB'
  if (gb >= 10) return `${Math.round(gb)} GB`
  return `${gb.toFixed(1)} GB`
}

export default function StorageLine ({ downloaded = [], disk, usedBytes = 0, bytesOf }) {
  if (!disk || !disk.total) return null

  const size = (m) => (bytesOf ? bytesOf(m) : Math.round((Number(m?.sizeGB) || 0) * GB))

  return (
    <div className="rx-storage" style={{ position: 'fixed' }}>
      <div className="rx-storage-track" aria-hidden="true">
        {downloaded.map(m => (
          <div
            key={m.id}
            className="rx-storage-seg"
            style={{ width: `${Math.max(0.6, (size(m) / disk.total) * 100)}%` }}
          />
        ))}
      </div>
      {/* One sentence, in both states. With nothing downloaded the empty track
          and "0 GB of 128 GB" still make the argument — the model is a thing
          that weighs something, and right now it weighs nothing. */}
      <div className="rx-storage-label">
        {`${fmt(usedBytes)} of ${fmt(disk.total)} used by models.`}
      </div>
    </div>
  )
}

export { StorageLine }
