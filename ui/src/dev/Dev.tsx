import { useEffect, useRef, useState } from 'react'
import App from '../App'
import { dispatch, setMockHandler } from '../lib/nui'
import { camStore, toast } from '../lib/store'
import { type V3, basis, local, project, dot, sub, norm } from '../lib/math'
import { devWorld, mock, openStudio } from './mock'

setMockHandler(mock)

// Browser canvas preview simulating in-game 3D projection.
function DevWorld() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    ;(window as any).__devFrame = () => c
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const W = (c.width = window.innerWidth), H = (c.height = window.innerHeight)
      const cam = camStore.get()
      const s = { w: W, h: H }
      const st = devWorld.studio
      const matte = (devWorld as any).matte as string | null
      const inStudio = !!st && document.querySelector('.studio')
      const origin: V3 = inStudio ? st.stage.origin : { x: 0, y: 0, z: 0 }
      if (matte === 'black' || matte === 'white' || matte === 'chroma') {
        ctx.fillStyle = matte === 'black' ? '#000' : matte === 'white' ? '#fff' : '#00ff40'
        ctx.fillRect(0, 0, W, H)
      } else if (inStudio && st.backdrop.mode !== 'none') {
        const g = ctx.createLinearGradient(0, 0, 0, H)
        g.addColorStop(0, st.backdrop.mode === 'chroma' ? st.backdrop.chroma : st.backdrop.top)
        g.addColorStop(1, st.backdrop.mode === 'chroma' ? st.backdrop.chroma : st.backdrop.bottom)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H)
        g.addColorStop(0, '#7f9bb8'); g.addColorStop(0.55, '#c9cfd2'); g.addColorStop(0.56, '#59544c'); g.addColorStop(1, '#3a3631')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 1
        for (let i = -20; i <= 20; i++) {
          for (const [a, b] of [[{ x: origin.x + i, y: origin.y - 20, z: origin.z }, { x: origin.x + i, y: origin.y + 20, z: origin.z }], [{ x: origin.x - 20, y: origin.y + i, z: origin.z }, { x: origin.x + 20, y: origin.y + i, z: origin.z }]] as V3[][]) {
            const pa = project(a, cam, s), pb = project(b, cam, s)
            if (pa && pb) { ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke() }
          }
        }
      }
      const boxes: { pos: V3; rot: V3 }[] = []
      if (document.querySelector('.editor')) boxes.push(devWorld.editor())
      if (inStudio) for (const it of st.items) if (it.kind === 'prop' && it.visible) boxes.push(it)
      const light = norm({ x: -0.5, y: -0.6, z: 0.8 })
      for (const bx of boxes) {
        const d = devWorld.dims
        const b = basis(bx.rot)
        const faces: [V3, V3[]][] = [
          [b.u, [{ x: d.min.x, y: d.min.y, z: d.max.z }, { x: d.max.x, y: d.min.y, z: d.max.z }, { x: d.max.x, y: d.max.y, z: d.max.z }, { x: d.min.x, y: d.max.y, z: d.max.z }]],
          [{ x: -b.f.x, y: -b.f.y, z: -b.f.z }, [{ x: d.min.x, y: d.min.y, z: d.min.z }, { x: d.max.x, y: d.min.y, z: d.min.z }, { x: d.max.x, y: d.min.y, z: d.max.z }, { x: d.min.x, y: d.min.y, z: d.max.z }]],
          [b.f, [{ x: d.min.x, y: d.max.y, z: d.min.z }, { x: d.max.x, y: d.max.y, z: d.min.z }, { x: d.max.x, y: d.max.y, z: d.max.z }, { x: d.min.x, y: d.max.y, z: d.max.z }]],
          [b.r, [{ x: d.max.x, y: d.min.y, z: d.min.z }, { x: d.max.x, y: d.max.y, z: d.min.z }, { x: d.max.x, y: d.max.y, z: d.max.z }, { x: d.max.x, y: d.min.y, z: d.max.z }]],
          [{ x: -b.r.x, y: -b.r.y, z: -b.r.z }, [{ x: d.min.x, y: d.min.y, z: d.min.z }, { x: d.min.x, y: d.max.y, z: d.min.z }, { x: d.min.x, y: d.max.y, z: d.max.z }, { x: d.min.x, y: d.min.y, z: d.max.z }]],
        ]
        for (const [n, quad] of faces) {
          const w = quad.map((q) => local(bx.pos, b, q))
          if (dot(n, sub(w[0], cam.p)) >= 0) continue
          const pts = w.map((q) => project(q, cam, s))
          if (pts.some((p) => !p)) continue
          const k = 0.35 + 0.65 * Math.max(0, dot(n, light))
          ctx.fillStyle = `rgb(${Math.round(196 * k)},${Math.round(120 * k)},${Math.round(64 * k)})`
          ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p!.x, p!.y) : ctx.moveTo(p!.x, p!.y))); ctx.closePath(); ctx.fill()
        }
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="dev-world" />
}

function DevBar() {
  const [open, setOpen] = useState(true)
  if (!open) return <button className="devbar-toggle" onClick={() => setOpen(true)}>dev</button>
  return (
    <div className="devbar">
      <span className="devbar-title">Preview</span>
      <button onClick={() => dispatch('screen', { screen: 'hub', data: { perms: { edit: true, studio: true, packs: true }, me: { x: 2, y: 0, z: 0 } } })}>Hub</button>
      <button onClick={() => mock('hub:place', { model: 'osm_tyre_inflator' })}>Editor</button>
      <button onClick={() => mock('hub:points', { model: 'osm_tyre_inflator', interaction: 'inflate' })}>Points</button>
      <button onClick={() => openStudio()}>Studio</button>
      <button onClick={() => toast('Pack OsmFX Workshop 1.1.0 installed.', 'success')}>Toast</button>
      <button onClick={() => dispatch('screen', { screen: null })}>Close</button>
      <button onClick={() => setOpen(false)}>×</button>
    </div>
  )
}

export default function Dev() {
  return (
    <>
      <DevWorld />
      <App />
      <DevBar />
    </>
  )
}
