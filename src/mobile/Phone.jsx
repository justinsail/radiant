/**
 * Phone — the phone app's entry point, and the only module App.jsx knows about.
 *
 * It exists to keep two things out of the desktop build: mobile.css (imported
 * here, so it lands in the phone chunk and never in the Mac bundle) and the
 * whole src/mobile tree behind it. App.jsx reaches this through a lazy import
 * that only runs inside the native shell.
 */
import React, { useEffect } from 'react'
import './mobile.css'
import MobileShell from './MobileShell.jsx'

export default function Phone () {
  // Dynamic Type: mobile.css cannot test a custom property in a media query, so
  // the AX reflow (catalog rows go to two lines rather than truncating the model
  // name) is gated on a data attribute measured here. The shell measures the
  // same scale for --rx-dt; this is the one bit that has to live on the root.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('is-native')
    const measure = () => {
      const p = document.createElement('span')
      p.style.font = '-apple-system-body'
      p.style.position = 'fixed'
      p.style.visibility = 'hidden'
      p.textContent = 'M'
      document.body.appendChild(p)
      const dt = parseFloat(getComputedStyle(p).fontSize) / 17
      p.remove()
      const v = Math.min(Math.max(dt || 1, 0.82), 1.6)
      root.style.setProperty('--rx-dt', String(v))
      if (v > 1.2) root.setAttribute('data-ax', 'true')
      else root.removeAttribute('data-ax')
    }
    measure()
    window.addEventListener('resize', measure)
    document.addEventListener('visibilitychange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      document.removeEventListener('visibilitychange', measure)
    }
  }, [])

  return <MobileShell />
}

export { Phone }
