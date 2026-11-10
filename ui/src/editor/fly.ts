import { useEffect, useRef } from 'react'
import { fetchNui } from '../lib/nui'
import type { V3 } from '../lib/math'

// Freecam and orbit viewport controls for editor and studio modes.
export type FlyState = { looking: boolean }

export function useFly(opts: { center: () => V3 | null; enabled?: boolean; target: () => HTMLElement | null }) {
  const st = useRef({ looking: false, orbit: false, pan: false, keys: new Set<string>(), dx: 0, dy: 0, odx: 0, ody: 0, raf: 0, sent: '' })
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const s = st.current
    const sendInput = () => {
      const k = s.keys
      const f = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0)
      const r = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0)
      const u = (k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0)
      const payload = s.looking ? { f, r, u, fast: k.has('shift'), slow: k.has('control') } : { f: 0, r: 0, u: 0 }
      const key = JSON.stringify(payload)
      if (key !== s.sent) { s.sent = key; fetchNui('cam:input', payload) }
    }
    const frame = () => {
      s.raf = 0
      if (s.dx || s.dy) { fetchNui('cam:look', { dx: s.dx, dy: s.dy }); s.dx = 0; s.dy = 0 }
      if (s.odx || s.ody) {
        if (s.pan) fetchNui('cam:pan', { dx: s.odx, dy: s.ody })
        else fetchNui('cam:orbit', { dx: s.odx, dy: s.ody, center: optsRef.current.center() })
        s.odx = 0; s.ody = 0
      }
    }
    const queue = () => { if (!s.raf) s.raf = requestAnimationFrame(frame) }

    const onDown = (e: MouseEvent) => {
      if (optsRef.current.enabled === false) return
      const el = optsRef.current.target()
      if (!el || e.target !== el) return
      if (e.button === 2) { s.looking = true; e.preventDefault(); sendInput() }
      if (e.button === 1 || (e.button === 0 && e.altKey)) { s.orbit = true; s.pan = e.shiftKey; e.preventDefault() }
    }
    const onMove = (e: MouseEvent) => {
      if (s.looking) { s.dx += e.movementX; s.dy += e.movementY; queue() }
      else if (s.orbit) { s.odx += e.movementX; s.ody += e.movementY; queue() }
    }
    const onUp = (e: MouseEvent) => {
      if (e.button === 2 && s.looking) { s.looking = false; sendInput() }
      if ((e.button === 1 || e.button === 0) && s.orbit) { s.orbit = false; s.pan = false }
    }
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (!['w', 'a', 's', 'd', 'q', 'e', 'shift', 'control'].includes(k)) return
      if (down) s.keys.add(k); else s.keys.delete(k)
      if (s.looking) { e.preventDefault(); e.stopPropagation(); sendInput() }
    }
    const onWheel = (e: WheelEvent) => {
      if (optsRef.current.enabled === false) return
      const el = optsRef.current.target()
      if (!el || e.target !== el) return
      const d = Math.sign(e.deltaY)
      if (s.looking) fetchNui('cam:speed', { delta: d })
      else fetchNui('cam:zoom', { delta: d })
    }
    const onCtx = (e: MouseEvent) => e.preventDefault()
    const kd = onKey(true), ku = onKey(false)
    const blur = () => { s.keys.clear(); s.looking = false; s.orbit = false; sendInput() }

    window.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', kd, true)
    window.addEventListener('keyup', ku, true)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('contextmenu', onCtx)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', kd, true)
      window.removeEventListener('keyup', ku, true)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('contextmenu', onCtx)
      window.removeEventListener('blur', blur)
      fetchNui('cam:input', { f: 0, r: 0, u: 0 })
    }
  }, [])

  return st
}
