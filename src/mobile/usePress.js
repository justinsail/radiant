/**
 * usePress — press feedback, JS-driven, because :hover sticks after a tap on
 * iOS and :active alone cannot be cancelled by a finger that slid away.
 *
 * Two behaviors, and mixing them is a tell:
 *   list rows          background jumps in at 0ms, fades out over 250ms
 *   prominent controls scale(0.96) down, spring back
 * Both are the same class here (.is-pressed); mobile.css decides which is which
 * from .rx-row vs .rx-pressable.
 *
 * Commit is on pointer-up inside the bounds — the way UIKit does it. A tap that
 * fires on touch-down feels twitchy and cannot be taken back.
 */
import { useMemo, useRef, useState } from 'react'
import * as haptics from './haptics.js'

const SLOP = 10 // pt: past this the finger has become a scroll, not a tap

export default function usePress (onPress, { haptic = 'LIGHT', disabled = false } = {}) {
  const [pressed, setPressed] = useState(false)
  const origin = useRef(null)

  const handlers = useMemo(() => ({
    onPointerDown (e) {
      if (disabled) return
      origin.current = { x: e.clientX, y: e.clientY }
      setPressed(true)
    },
    onPointerMove (e) {
      if (!origin.current) return
      if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > SLOP) {
        origin.current = null
        setPressed(false)
      }
    },
    onPointerUp (e) {
      const live = !!origin.current
      origin.current = null
      setPressed(false)
      if (!live || disabled) return
      if (haptic === 'selection') haptics.selection()
      else if (haptic) haptics.impact(haptic)
      onPress?.(e)
    },
    onPointerCancel () { origin.current = null; setPressed(false) },
    onLostPointerCapture () { origin.current = null; setPressed(false) }
  }), [onPress, haptic, disabled])

  return { pressed, handlers, className: pressed ? ' is-pressed' : '' }
}

export { usePress }
