import { useSyncExternalStore, useRef, useEffect, useState } from 'react'
import type { Boot, Model, Placement, Perms } from './types'
import type { CamFrame, V3 } from './math'
import { rpc } from './nui'

// Store: one small global state for everything the hub, editor and studio share. No library, just a subscribe list
export type Toast = { id: number; text: string; kind: 'info' | 'success' | 'error' | 'warning' }
export type Screen = 'hub' | 'editor' | 'studio' | null

export type AppState = {
  boot: Boot | null
  screen: Screen
  screenData: any
  models: Record<string, Model>
  placements: Record<string, Placement>
  me: V3
  perms: Perms
  thumbs: Record<string, string>
  toasts: Toast[]
  hidden: boolean
}

let state: AppState = {
  boot: null, screen: null, screenData: null, models: {}, placements: {}, me: { x: 0, y: 0, z: 0 }, perms: {}, thumbs: {}, toasts: [], hidden: false,
}
const subs = new Set<() => void>()

export const app = {
  get: () => state,
  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    const p = typeof patch === 'function' ? patch(state) : patch
    state = { ...state, ...p }
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
}

export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(app.subscribe, () => sel(state))
}

let toastId = 0
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++toastId
  app.set((s) => ({ toasts: [...s.toasts, { id, text, kind }].slice(-4) }))
  setTimeout(() => app.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 5200 : 3400)
}

// Reply: show a server reply's message, return whether it worked
export function replied(res: any, okText?: string) {
  if (res && res.ok) { if (okText) toast(okText, 'success'); return true }
  toast((res && res.msg) || 'That did not work.', 'error')
  return false
}

// Thumbs: model pictures come from studio shots, fetched once per id
const asked = new Set<string>()
export function useThumb(id?: string) {
  const t = useApp((s) => (id ? s.thumbs[id] : undefined))
  useEffect(() => {
    if (!id || asked.has(id)) return
    asked.add(id)
    rpc('thumbs', { ids: [id] }).then((r) => { if (r?.thumbs) app.set((s) => ({ thumbs: { ...s.thumbs, ...r.thumbs } })) })
  }, [id])
  return t
}

// Camera frames: kept outside React state, read at animation-frame rate by the overlays that need them
let cam: CamFrame = { p: { x: 0, y: -6, z: 2 }, r: { x: -12, y: 0, z: 0 }, fov: 50, speed: 4 }
const camSubs = new Set<() => void>()
export const camStore = {
  get: () => cam,
  set(c: CamFrame) { cam = c; camSubs.forEach((f) => f()) },
  subscribe(f: () => void) { camSubs.add(f); return () => { camSubs.delete(f) } },
}

// useCam: re-renders at most once per animation frame with the latest camera
export function useCam(): CamFrame {
  const [, force] = useState(0)
  const pending = useRef(false)
  useEffect(() => camStore.subscribe(() => {
    if (pending.current) return
    pending.current = true
    requestAnimationFrame(() => { pending.current = false; force((n) => n + 1) })
  }), [])
  return cam
}

export function useScreenSize() {
  const [s, setS] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const f = () => setS({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return s
}

export function str(key: string, fallback: string) {
  return state.boot?.strings?.[key] ?? fallback
}
