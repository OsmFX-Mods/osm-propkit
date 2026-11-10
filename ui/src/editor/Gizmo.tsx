import { useRef, useState } from 'react'
import {
  type V3, type Basis, type CamFrame, type Screen, add, basis, closestOnAxis, dot, euler, project, ray, rayPlane, rotateBasis,
  screenUnit, snap, sub, scale, local, norm, cross,
} from '../lib/math'
import { cx } from '../lib/format'

// SVG transform gizmo projected from live camera with 3D ray-cast drag solving.

export type Mode = 'move' | 'rotate'
export type Space = 'world' | 'local'
export type Handle = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'rx' | 'ry' | 'rz' | 'free'
export type Snap = { on: boolean; move: number; turn: number }

const COL = { x: 'var(--ax)', y: 'var(--ay)', z: 'var(--az)' }
const WORLD: Basis = { r: { x: 1, y: 0, z: 0 }, f: { x: 0, y: 1, z: 0 }, u: { x: 0, y: 0, z: 1 } }

function axesOf(rot: V3, space: Space): Record<'x' | 'y' | 'z', V3> {
  const b = space === 'local' ? basis(rot) : WORLD
  return { x: b.r, y: b.f, z: b.u }
}

const pts = (list: ({ x: number; y: number } | null)[]) => list.filter(Boolean).map((p) => `${p!.x.toFixed(1)},${p!.y.toFixed(1)}`).join(' ')

export type DragInfo = { handle: Handle; text: string; x: number; y: number }

export function Gizmo({ cam, screen, pos, rot, mode, space, snapCfg, onStart, onChange, onEnd, onFree, hidden }: {
  cam: CamFrame; screen: Screen; pos: V3; rot: V3; mode: Mode; space: Space; snapCfg: Snap
  onStart: () => void; onChange: (pos: V3, rot: V3, info: DragInfo) => void; onEnd: () => void
  onFree?: (sx: number, sy: number) => void; hidden?: boolean
}) {
  const [hover, setHover] = useState<Handle | null>(null)
  const [active, setActive] = useState<Handle | null>(null)
  const live = useRef({ cam, screen, snapCfg })
  live.current = { cam, screen, snapCfg }

  const O = project(pos, cam, screen)
  if (!O || hidden) return null
  const L = screenUnit(pos, cam, 0.17)
  const A = axesOf(rot, space)
  const viewDir = norm(sub(pos, cam.p))

  const begin = (h: Handle, e: React.MouseEvent) => {
    if (e.button !== 0 || e.altKey) return
    e.preventDefault()
    e.stopPropagation()
    const c0 = live.current.cam, s0 = live.current.screen
    const startPos = { ...pos }, startRot = { ...rot }
    const startBasis = basis(rot)
    const axes = axesOf(rot, space)
    const r0 = ray(e.clientX, e.clientY, c0, s0)
    let axis: V3 | null = null, s0p = 0, plane: { n: V3; a1: V3; a2: V3 } | null = null, hit0: V3 | null = null
    const center = project(pos, c0, s0)!
    const ang0 = Math.atan2(e.clientY - center.y, e.clientX - center.x)
    let unwrapped = 0, lastAng = ang0

    if (h === 'x' || h === 'y' || h === 'z') { axis = axes[h]; s0p = closestOnAxis(startPos, axis, r0.o, r0.d) }
    if (h === 'xy' || h === 'xz' || h === 'yz') {
      const [k1, k2] = h.split('') as ('x' | 'y' | 'z')[]
      plane = { a1: axes[k1], a2: axes[k2], n: norm(cross(axes[k1], axes[k2])) }
      hit0 = rayPlane(r0.o, r0.d, startPos, plane.n)
    }
    if (h === 'free') { onFree?.(e.clientX, e.clientY) }

    setActive(h)
    onStart()
    document.body.classList.add('is-dragging')

    const move = (ev: MouseEvent) => {
      const { cam: c, screen: s, snapCfg: sn } = live.current
      const r = ray(ev.clientX, ev.clientY, c, s)
      const fine = ev.shiftKey ? 0.1 : 1
      const snapping = sn.on !== ev.ctrlKey
      if (axis) {
        let d = (closestOnAxis(startPos, axis, r.o, r.d) - s0p) * fine
        if (snapping) d = snap(d, sn.move)
        onChange(add(startPos, axis, d), startRot, { handle: h, text: `${d >= 0 ? '+' : ''}${d.toFixed(3)} m`, x: ev.clientX, y: ev.clientY })
      } else if (plane && hit0) {
        const hit = rayPlane(r.o, r.d, startPos, plane.n)
        if (!hit) return
        const d = scale(sub(hit, hit0), fine)
        let u = dot(d, plane.a1), v = dot(d, plane.a2)
        if (snapping) { u = snap(u, sn.move); v = snap(v, sn.move) }
        onChange(add(add(startPos, plane.a1, u), plane.a2, v), startRot, { handle: h, text: `${u.toFixed(3)}, ${v.toFixed(3)} m`, x: ev.clientX, y: ev.clientY })
      } else if (h === 'rx' || h === 'ry' || h === 'rz') {
        const ax = axes[h[1] as 'x' | 'y' | 'z']
        const ctr = project(startPos, c, s) ?? center
        const ang = Math.atan2(ev.clientY - ctr.y, ev.clientX - ctr.x)
        let da = ang - lastAng
        if (da > Math.PI) da -= Math.PI * 2
        if (da < -Math.PI) da += Math.PI * 2
        unwrapped += da * fine
        lastAng = ang
        // Screen y points down: seen from the axis tip a positive turn runs anti-clockwise, which is a falling screen angle
        const facing = dot(ax, basis(c.r).f) < 0 ? -1 : 1
        let deg = (unwrapped * 180) / Math.PI * facing
        if (snapping) deg = snap(deg, sn.turn)
        onChange(startPos, euler(rotateBasis(startBasis, ax, deg)), { handle: h, text: `${deg >= 0 ? '+' : ''}${deg.toFixed(1)}°`, x: ev.clientX, y: ev.clientY })
      } else if (h === 'free') {
        onFree?.(ev.clientX, ev.clientY)
      }
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('is-dragging')
      setActive(null)
      onEnd()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const on = (h: Handle) => active === h || (!active && hover === h)
  const ev = (h: Handle) => ({
    onMouseDown: (e: React.MouseEvent) => begin(h, e),
    onMouseEnter: () => setHover(h),
    onMouseLeave: () => setHover((x) => (x === h ? null : x)),
    className: cx('gz-hit', on(h) && 'is-on'),
  })

  const els: React.ReactNode[] = []
  if (mode === 'move') {
    // Planes first so arrows draw on top
    ;(['xy', 'xz', 'yz'] as const).forEach((h) => {
      const [k1, k2] = h.split('') as ('x' | 'y' | 'z')[]
      const n = norm(cross(A[k1], A[k2]))
      if (Math.abs(dot(n, viewDir)) < 0.18) return
      const a = 0.22 * L, b = 0.42 * L
      const quad = [add(add(pos, A[k1], a), A[k2], a), add(add(pos, A[k1], b), A[k2], a), add(add(pos, A[k1], b), A[k2], b), add(add(pos, A[k1], a), A[k2], b)].map((p) => project(p, cam, screen))
      if (quad.some((q) => !q)) return
      const k3 = (['x', 'y', 'z'] as const).find((k) => k !== k1 && k !== k2)!
      els.push(<polygon key={h} points={pts(quad)} {...ev(h)} style={{ '--c': COL[k3] } as React.CSSProperties} data-kind="plane" />)
    })
    ;(['x', 'y', 'z'] as const).forEach((k) => {
      if (Math.abs(dot(A[k], viewDir)) > 0.985) return
      const p0 = project(add(pos, A[k], L * 0.16), cam, screen)
      const p1 = project(add(pos, A[k], L), cam, screen)
      if (!p0 || !p1) return
      const dx = p1.x - p0.x, dy = p1.y - p0.y
      const l = Math.hypot(dx, dy) || 1
      const ux = dx / l, uy = dy / l
      const head = 11
      const tip = { x: p1.x + ux * head * 1.2, y: p1.y + uy * head * 1.2 }
      const left = { x: p1.x - uy * head * 0.5, y: p1.y + ux * head * 0.5 }
      const right = { x: p1.x + uy * head * 0.5, y: p1.y - ux * head * 0.5 }
      els.push(
        <g key={k} {...ev(k)} style={{ '--c': COL[k] } as React.CSSProperties} data-kind="axis">
          <line x1={p0.x} y1={p0.y} x2={tip.x} y2={tip.y} className="gz-pad" />
          <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} className="gz-stem" />
          <polygon points={pts([tip, left, right])} className="gz-head" />
          <text x={tip.x + ux * 12} y={tip.y + uy * 12 + 4} className="gz-label">{k.toUpperCase()}</text>
        </g>,
      )
    })
    els.push(
      <g key="free" {...ev('free')} data-kind="free">
        <circle cx={O.x} cy={O.y} r={13} className="gz-pad" />
        <circle cx={O.x} cy={O.y} r={7} className="gz-free" />
      </g>,
    )
  } else {
    ;(['x', 'y', 'z'] as const).forEach((k) => {
      const ax = A[k]
      // Ring basis: two unit vectors perpendicular to the axis
      const helper = Math.abs(ax.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
      const e1 = norm(cross(ax, helper)), e2 = norm(cross(ax, e1))
      const R = L * 0.86
      const front: string[] = [], back: string[] = []
      let segFront = '', segBack = ''
      for (let i = 0; i <= 72; i++) {
        const t = (i / 72) * Math.PI * 2
        const w = add(add(pos, e1, Math.cos(t) * R), e2, Math.sin(t) * R)
        const p = project(w, cam, screen)
        if (!p) continue
        const facing = dot(sub(w, pos), viewDir) < 0
        const s = `${p.x.toFixed(1)},${p.y.toFixed(1)} `
        if (facing) { segFront += s; if (segBack) { back.push(segBack); segBack = '' } }
        else { segBack += s; if (segFront) { front.push(segFront); segFront = '' } }
      }
      if (segFront) front.push(segFront)
      if (segBack) back.push(segBack)
      const h = `r${k}` as Handle
      els.push(
        <g key={k} {...ev(h)} style={{ '--c': COL[k] } as React.CSSProperties} data-kind="ring">
          {back.map((s, i) => <polyline key={'b' + i} points={s} className="gz-ring-back" />)}
          {front.map((s, i) => <polyline key={'p' + i} points={s} className="gz-pad" />)}
          {front.map((s, i) => <polyline key={'f' + i} points={s} className="gz-ring" />)}
        </g>,
      )
    })
    els.push(<circle key="c" cx={O.x} cy={O.y} r={3} className="gz-dot" />)
  }

  return <g className={cx('gizmo', active && 'is-active')}>{els}</g>
}

// Box: the model's bounding box, so you see the real footprint while you move it
export function Box({ cam, screen, pos, rot, dims, tone = 'sel' }: { cam: CamFrame; screen: Screen; pos: V3; rot: V3; dims: { min: V3; max: V3 }; tone?: 'sel' | 'dim' }) {
  const b = basis(rot)
  const { min: a, max: c } = dims
  const corners = [
    { x: a.x, y: a.y, z: a.z }, { x: c.x, y: a.y, z: a.z }, { x: c.x, y: c.y, z: a.z }, { x: a.x, y: c.y, z: a.z },
    { x: a.x, y: a.y, z: c.z }, { x: c.x, y: a.y, z: c.z }, { x: c.x, y: c.y, z: c.z }, { x: a.x, y: c.y, z: c.z },
  ].map((o) => project(local(pos, b, o), cam, screen))
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
  return (
    <g className={cx('bbox', `bbox--${tone}`)}>
      {E.map(([i, j], n) => corners[i] && corners[j] ? <line key={n} x1={corners[i]!.x} y1={corners[i]!.y} x2={corners[j]!.x} y2={corners[j]!.y} className={n < 4 ? 'is-floor' : ''} /> : null)}
    </g>
  )
}

// Drop line: a plumb line from the prop's underside to the ground with the gap in metres
export function DropLine({ cam, screen, pos, rot, dims, ground }: { cam: CamFrame; screen: Screen; pos: V3; rot: V3; dims: { min: V3; max: V3 }; ground?: number }) {
  if (ground === undefined || ground === null || Math.abs(ground) < 0.002) return null
  const b = basis(rot)
  const centre = local(pos, b, { x: (dims.min.x + dims.max.x) / 2, y: (dims.min.y + dims.max.y) / 2, z: 0 })
  let lowZ = Infinity
  for (const x of [dims.min.x, dims.max.x]) for (const y of [dims.min.y, dims.max.y]) for (const z of [dims.min.z, dims.max.z]) {
    const w = local(pos, b, { x, y, z })
    if (w.z < lowZ) lowZ = w.z
  }
  const top = project({ x: centre.x, y: centre.y, z: lowZ }, cam, screen)
  const bot = project({ x: centre.x, y: centre.y, z: lowZ - ground }, cam, screen)
  if (!top || !bot) return null
  return (
    <g className={cx('drop', ground < 0 && 'is-below')}>
      <line x1={top.x} y1={top.y} x2={bot.x} y2={bot.y} />
      <circle cx={bot.x} cy={bot.y} r={3.5} />
      <text x={(top.x + bot.x) / 2 + 10} y={(top.y + bot.y) / 2 + 4}>{ground < 0 ? `${(-ground).toFixed(3)} m into the ground` : `${ground.toFixed(3)} m above ground`}</text>
    </g>
  )
}

// Renders interactive point markers projected onto the prop.
export function Pins({ cam, screen, pos, rot, points, activeId, showRadius }: { cam: CamFrame; screen: Screen; pos: V3; rot: V3; points: { id: string; label: string; point: V3; radius?: number }[]; activeId?: string; showRadius?: boolean }) {
  const b = basis(rot)
  return (
    <g className="pins">
      {points.map((p, n) => {
        const w = local(pos, b, p.point)
        const s = project(w, cam, screen)
        if (!s) return null
        const edge = project(add(w, b.r, p.radius ?? 0.35), cam, screen)
        const rad = edge ? Math.max(6, Math.hypot(edge.x - s.x, edge.y - s.y)) : 10
        const on = p.id === activeId
        return (
          <g key={p.id} className={cx('pin', on && 'is-on')} transform={`translate(${s.x.toFixed(1)},${s.y.toFixed(1)})`}>
            {(on || showRadius) && <circle r={rad} className="pin-radius" />}
            <circle r={9} className="pin-dot" />
            <text y={3.5} className="pin-n">{n + 1}</text>
            <text x={16} y={4} className="pin-label">{p.label}</text>
          </g>
        )
      })}
    </g>
  )
}
