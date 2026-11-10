import { useEffect } from 'react'
import { fetchNui, useNuiEvent } from './lib/nui'
import { app, camStore, toast, useApp } from './lib/store'
import type { Boot, Model, Placement } from './lib/types'
import { ConfirmHost, Toasts } from './kit/ui'
import { Hub } from './hub/Hub'
import { Editor } from './editor/Editor'
import { Studio } from './studio/Studio'

const byModel = (list: Model[]) => Object.fromEntries(list.map((m) => [m.model, m]))
const byId = (list: Placement[]) => Object.fromEntries(list.map((p) => [p.id, p]))

// Hub data: models and placements as the client sees them, refreshed whenever the hub opens
export async function loadHubData() {
  const d = await fetchNui<{ models: Model[]; placements: Placement[]; me: any; perms: any }>('hub:data')
  if (d && d.models) app.set({ models: byModel(d.models), placements: byId(d.placements || []), me: d.me, perms: d.perms || app.get().perms })
}

export default function App() {
  const screen = useApp((s) => s.screen)

  // Scale: panels are designed at 1080p and grow with the screen, the world overlays stay in real pixels
  useEffect(() => {
    const f = () => document.documentElement.style.setProperty('--k', String(Math.min(2, Math.max(0.85, window.innerHeight / 1080))))
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])

  useEffect(() => {
    fetchNui<Boot>('boot').then((b) => { if (b && b.catalog) app.set({ boot: b, perms: b.perms || {} }) })
  }, [])

  useNuiEvent<{ screen: any; data: any }>('screen', (d) => {
    app.set({ screen: d.screen ?? null, screenData: d.data ?? null, hidden: false })
    if (d.screen === 'hub') {
      if (d.data?.perms) app.set({ perms: d.data.perms })
      if (d.data?.me) app.set({ me: d.data.me })
      loadHubData()
    }
  })
  useNuiEvent<{ text: string; kind: any }>('toast', (d) => toast(d.text, d.kind))
  useNuiEvent<any>('me', (d) => app.set({ me: d }))
  useNuiEvent<{ p: number[]; r: number[]; f: number; s?: number }>('cam', (d) => {
    camStore.set({ p: { x: d.p[0], y: d.p[1], z: d.p[2] }, r: { x: d.r[0], y: d.r[1], z: d.r[2] }, fov: d.f, speed: d.s })
  })
  useNuiEvent<{ kind: string; up?: any[]; rm?: string[]; models?: Model[]; placements?: Placement[] }>('hub:delta', (d) => {
    if (d.kind === 'reset') return app.set({ models: byModel(d.models || []), placements: byId(d.placements || []) })
    if (d.kind === 'models') app.set((s) => {
      const models = { ...s.models }
      for (const m of d.up || []) models[m.model] = m
      for (const n of d.rm || []) delete models[n]
      return { models }
    })
    if (d.kind === 'placements') app.set((s) => {
      const placements = { ...s.placements }
      for (const p of d.up || []) placements[p.id] = p
      for (const n of d.rm || []) delete placements[n]
      return { placements }
    })
  })

  return (
    <div className="app">
      {screen === 'hub' && <Hub />}
      {screen === 'editor' && <Editor />}
      {screen === 'studio' && <Studio />}
      <Toasts />
      <ConfirmHost />
    </div>
  )
}
