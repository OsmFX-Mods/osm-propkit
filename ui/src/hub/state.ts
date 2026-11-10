import { useSyncExternalStore } from 'react'
import type { Interaction } from '../lib/types'

// Persistent hub navigation and draft state.
export type Owner = { kind: 'model'; model: string } | { kind: 'placement'; id: string }
export type Sheet =
  | { kind: 'model'; model: string; tab?: 'profile' | 'interactions' | 'placed' }
  | { kind: 'placement'; id: string; tab?: 'overview' | 'interactions' }
  | { kind: 'import' }
  | { kind: 'diff'; token: string }
  | { kind: 'export'; models?: string[] }
  | null

export type HubView = {
  section: 'library' | 'placed' | 'packs'
  sheet: Sheet
  draft: { owner: Owner; index: number; interaction: Interaction; dirty: boolean } | null
  pickFor: { owner: Owner; index: number } | null
}

let view: HubView = { section: 'library', sheet: null, draft: null, pickFor: null }
const subs = new Set<() => void>()

export const hub = {
  get: () => view,
  set(p: Partial<HubView> | ((v: HubView) => Partial<HubView>)) {
    view = { ...view, ...(typeof p === 'function' ? p(view) : p) }
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
}

export function useHub<T>(sel: (v: HubView) => T): T {
  return useSyncExternalStore(hub.subscribe, () => sel(view))
}
