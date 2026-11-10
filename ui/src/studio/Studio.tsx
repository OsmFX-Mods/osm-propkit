import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchNui, rpc, useNuiEvent } from '../lib/nui'
import { app, camStore, replied, toast, useApp, useCam, useScreenSize } from '../lib/store'
import { Icon } from '../lib/icons'
import { Button, IconBtn, Input, Kbd, Menu, Segmented, Select, Slider, Field, confirm, copyText } from '../kit/ui'
import { cx, fmtBytes, uid } from '../lib/format'
import { type V3, add, basis, dist, local, lookAt, project, ray } from '../lib/math'
import { Gizmo, Box, type DragInfo, type Mode, type Space } from '../editor/Gizmo'
import { useFly } from '../editor/fly'
import { ASPECTS, type Item, type Overlay, type Scene, defaultScene, moveStage, subjectOf, toAbsolute, toRelative, worldPart } from './scene'
import { canRecord, shoot, startRecording, upload, type Rect } from './capture'
import { drawOverlays, type Box as OBox } from './overlays'
import { Outliner, Inspector } from './Panels'

export type Dims = Record<string, { min: V3; max: V3 }>
export type SessionShot = { id: string; thumb: string; blobUrl?: string; width: number; height: number; status: 'saving' | 'saved' | 'failed'; url?: string; file?: string; path?: string; bytes?: number; progress?: number; serverId?: string; video?: boolean; created?: number }

type Start = { here: { pos: V3; heading: number }; void: V3; model?: string; scene?: string; lodScale?: number; parkPed?: boolean }

// Vertical offset for closed set floor to prevent ground z-fighting.
const FLOOR_LIFT = 0.03
const stageOrigin = (start: Start, mode: 'here' | 'void'): V3 => ({ ...start.here.pos, z: start.here.pos.z + (mode === 'void' ? FLOOR_LIFT : 0) })

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function frameRect(aspect: string, w: number, h: number): Rect {
  const a = ASPECTS.find((x) => x.id === aspect)?.ratio
  if (!a) return { x: 0, y: 0, w, h }
  let fw = h * a, fh = h
  if (fw > w) { fw = w; fh = w / a }
  // Snaps near-screen dimensions to full viewport.
  if (Math.abs(fw - w) < 3 && Math.abs(fh - h) < 3) return { x: 0, y: 0, w, h }
  return { x: Math.round((w - fw) / 2), y: Math.round((h - fh) / 2), w: Math.round(fw), h: Math.round(fh) }
}

export function itemCenter(it: Item, dims: Dims): V3 {
  if (it.kind === 'prop') {
    const d = dims[it.model]
    if (d) return local(it.pos, basis(it.rot), { x: (d.min.x + d.max.x) / 2, y: (d.min.y + d.max.y) / 2, z: (d.min.z + d.max.z) / 2 })
  }
  if (it.kind === 'ped') return add(it.pos, { x: 0, y: 0, z: 0 })
  return it.pos
}

export function Studio() {
  const start = useApp((s) => s.screenData) as Start
  const models = useApp((s) => s.models)
  const cam = useCam()
  const screen = useScreenSize()
  const [scene, setSceneRaw] = useState<Scene>(() => defaultScene(stageOrigin(start, 'void'), 'void', start.model))
  const [sel, setSel] = useState<string>(() => subjectOf(scene)?.id ?? 'scene')
  const [dims, setDims] = useState<Dims>({})
  const [mode, setMode] = useState<Mode>('move')
  const [space, setSpace] = useState<Space>('world')
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [clean, setClean] = useState(false)
  const [shooting, setShooting] = useState<string | null>(null)
  const [flash, setFlash] = useState(0)
  const [shots, setShots] = useState<SessionShot[]>([])
  const [lightbox, setLightbox] = useState<SessionShot | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const [timeline, setTimeline] = useState(false)
  const [playT, setPlayT] = useState<number | null>(null)
  const [recording, setRecording] = useState<null | { stop: () => Promise<any> }>(null)
  const [savedAs, setSavedAs] = useState<string | undefined>()
  const viewport = useRef<HTMLDivElement>(null)
  const overlayCanvas = useRef<HTMLCanvasElement>(null)
  const boxes = useRef<OBox[]>([])
  const live = useRef(scene)
  live.current = scene
  const rect = useMemo(() => frameRect(scene.output.aspect, screen.w, screen.h), [scene.output.aspect, screen])

  const setScene = useCallback((fn: (s: Scene) => Scene) => setSceneRaw((s) => fn(s)), [])
  const patchItem = useCallback((id: string, p: Partial<Item>) => setScene((s) => ({ ...s, items: s.items.map((i) => (i.id === id ? ({ ...i, ...p } as Item) : i)) })), [setScene])

  // Syncs scene world state to client runtime with debouncing.
  const syncKey = JSON.stringify(worldPart(scene))
  useEffect(() => {
    const t = setTimeout(() => {
      const w = worldPart(live.current)
      fetchNui('studio:sync', { scene: w })
    }, 40)
    return () => clearTimeout(t)
  }, [syncKey])

  // Fetches model bounding dimensions for scene props.
  const modelsKey = scene.items.filter((i) => i.kind === 'prop').map((i) => (i as any).model).join('|')
  useEffect(() => {
    scene.items.forEach((i) => {
      if (i.kind !== 'prop' || dims[i.model]) return
      fetchNui('studio:dims', { model: i.model }).then((r) => { if (r?.ok) setDims((d) => ({ ...d, [i.model]: { min: r.min, max: r.max } })) })
    })
  }, [modelsKey])

  const subject = subjectOf(scene)
  const subjectCenter = subject ? itemCenter(subject, dims) : scene.stage.origin

  // Calculates initial camera framing for selected subject.
  const framed = useRef(false)
  useEffect(() => {
    if (framed.current) return
    if (subject && !dims[subject.model]) return
    framed.current = true
    const d = subject ? dims[subject.model] : undefined
    const r = d ? Math.max(0.4, dist(d.min, d.max) / 2) : 1
    const c = subjectCenter
    const dist0 = r / Math.tan((scene.camera.fov * Math.PI) / 360) * 1.9
    const from = add(c, { x: dist0 * 0.55, y: -dist0 * 0.8, z: dist0 * 0.32 })
    fetchNui('studio:cam', { pos: from, rot: lookAt(from, c), fov: scene.camera.fov, ease: 0, center: c })
  }, [dims, subject?.id])

  // Loads initial saved scene and server captures.
  useEffect(() => {
    if (!start.scene) return
    rpc('scene:get', { id: start.scene }).then((r) => { if (r?.ok) loadScene(r.scene) })
    rpc('shots:list').then(loadServerShots)
  }, [])
  useEffect(() => { if (!start.scene) rpc('shots:list').then(loadServerShots) }, [])

  function loadServerShots(r: any) {
    if (!r?.ok) return
    setShots((cur) => [...cur.filter((s) => s.status !== 'saved' || !s.serverId), ...r.shots.map((x: any) => ({ id: x.id, serverId: x.id, thumb: x.thumb, width: x.width, height: x.height, status: 'saved' as const, file: x.file, path: x.path, url: x.url, bytes: x.bytes, created: x.created }))])
  }

  const loadScene = (s: { id: string; name: string; model?: string; data: Scene }) => {
    const origin = stageOrigin(start, s.data.stage?.mode ?? 'void')
    const abs = toAbsolute({ ...defaultScene(origin, s.data.stage?.mode ?? 'void'), ...s.data, name: s.name, id: s.id }, origin)
    setSceneRaw(abs)
    setSavedAs(s.id)
    setSel(subjectOf(abs)?.id ?? 'scene')
    const first = abs.shots?.[0]
    if (first) { framed.current = true; fetchNui('studio:cam', { pos: first.pos, rot: first.rot, fov: first.fov, ease: 0, center: subjectOf(abs)?.pos }) }
    else framed.current = false
    toast(`Loaded ${s.name}.`, 'success')
  }

  const saveScene = async () => {
    const rel = toRelative(scene)
    const res = await rpc('scene:save', { scene: { id: savedAs, name: scene.name, model: subject?.model, data: rel } })
    if (replied(res, 'Scene saved.')) setSavedAs(res.id)
  }

  const exit = async () => {
    if (recording) return
    if (!(await confirm({ title: 'Leave the studio?', body: savedAs ? 'Unsaved changes to the scene are lost.' : 'This scene is not saved. Save it to reuse the setup or ship it in a pack.', confirm: 'Leave', tone: 'bad' }))) return
    fetchNui('studio:exit')
  }

  // Resolves currently selected scene item.
  const selected = scene.items.find((i) => i.id === sel)

  // Configures fly and orbit controls around selection.
  useFly({ center: () => (selected ? itemCenter(selected, dims) : subjectCenter), target: () => viewport.current })

  // Renders graphic overlay layer onto canvas.
  useEffect(() => {
    const c = overlayCanvas.current
    if (!c) return
    const dpr = 1
    c.width = rect.w * dpr; c.height = rect.h * dpr
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    if (!scene.overlays.length) { boxes.current = []; return }
    drawOverlays(ctx, scene.overlays, { w: c.width, h: c.height }, rect, cam, clean || shooting ? undefined : sel).then((b) => { boxes.current = b })
  }, [scene.overlays, cam, rect, sel, clean, shooting])

  // Viewport click handler for selecting elements or placing callout anchors.
  const onViewportDown = async (e: React.MouseEvent) => {
    if (e.button !== 0 || e.altKey || e.target !== viewport.current) return
    const fx = e.clientX - rect.x, fy = e.clientY - rect.y
    if (!picking) {
      for (const b of [...boxes.current].reverse()) {
        if (fx >= b.x - 6 && fx <= b.x + b.w + 6 && fy >= b.y - 6 && fy <= b.y + b.h + 6) {
          const o = live.current.overlays.find((x) => x.id === b.id)
          setSel(b.id)
          if (!o || o.kind === 'callout') return
          const sx = e.clientX, sy = e.clientY, ox = o.x, oy = o.y
          const move = (ev: MouseEvent) => {
            const nx = ox + (ev.clientX - sx) / rect.w, ny = oy + (ev.clientY - sy) / rect.h
            setScene((s) => ({ ...s, overlays: s.overlays.map((x) => (x.id === o.id ? ({ ...x, x: +nx.toFixed(4), y: +ny.toFixed(4) } as Overlay) : x)) }))
          }
          const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
          return
        }
      }
    }
    // Picks light and particle effect anchors in screen coordinates.
    for (const it of live.current.items) {
      if ((it.kind === 'light' || it.kind === 'fx') && it.visible) {
        const p = project(it.pos, camStore.get(), screen)
        if (p && Math.hypot(p.x - e.clientX, p.y - e.clientY) < 16) { setSel(it.id); return }
      }
    }
    const r = ray(e.clientX, e.clientY, camStore.get(), screen)
    const hit = await fetchNui('studio:pick', { o: r.o, d: r.d })
    if (picking) {
      if (!hit?.hit) return toast('Click on something in the scene.', 'warning')
      setScene((s) => ({ ...s, overlays: s.overlays.map((o) => (o.id === picking && o.kind === 'callout' ? { ...o, point: hit.pos, item: hit.id } : o)) }))
      setPicking(null)
      return
    }
    if (hit?.id) setSel(hit.id)
  }

  // Viewport keyboard shortcut listeners.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const key = e.key.toLowerCase()
      if (key === 'escape' && lightbox) return setLightbox(null)
      if (document.querySelector('.scrim')) return
      if (key === 'escape') { if (picking) return setPicking(null); return exit() }
      if (e.ctrlKey && key === 's') { e.preventDefault(); return saveScene() }
      if (e.ctrlKey) return
      if (key === ' ' || key === 'enter') { e.preventDefault(); return capture() }
      if (key === 'h') setClean((v) => !v)
      if (key === 'w') setMode('move')
      if (key === 'e' || key === 'r') setMode('rotate')
      if (key === 'q') setSpace((s) => (s === 'world' ? 'local' : 'world'))
      if (key === 'f') focusSel()
      if (key === 'k') addKey()
      if (key === 'b') addShot()
      if (key === 'delete' && selected) removeItem(selected.id)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const focusSel = () => {
    const it = selected ?? subject
    if (!it) return
    const d = it.kind === 'prop' ? dims[it.model] : undefined
    fetchNui('cam:focus', { center: itemCenter(it, dims), radius: d ? Math.max(0.3, dist(d.min, d.max) / 2) * 1.3 : 1 })
  }

  const removeItem = (id: string) => {
    setScene((s) => ({ ...s, items: s.items.filter((i) => i.id !== id), overlays: s.overlays.filter((o) => o.id !== id) }))
    setSel('scene')
  }

  const addShot = () => {
    const c = camStore.get()
    setScene((s) => ({ ...s, shots: [...s.shots, { id: uid('cam'), name: `Angle ${s.shots.length + 1}`, pos: c.p, rot: c.r, fov: c.fov }] }))
    toast('Camera angle saved.', 'success')
  }

  const addKey = () => {
    const c = camStore.get()
    setScene((s) => {
      const last = s.keys.length ? Math.max(...s.keys.map((k) => k.t)) : -2
      return { ...s, keys: [...s.keys, { id: uid('key'), t: +(last + 2).toFixed(2), pos: c.p, rot: c.r, fov: c.fov, ease: 'smooth' }] }
    })
    setTimeline(true)
  }

  // Updates shot state when remote upload webhook completes.
  useNuiEvent<{ id: string; ok: boolean; url?: string }>('studio:uploaded', (d) => {
    if (d.ok && d.url) setShots((s) => s.map((x) => (x.serverId === d.id ? { ...x, url: d.url } : x)))
  })

  useNuiEvent<{ t?: number; done?: boolean }>('studio:path', (d) => {
    if (d.done) { setPlayT(null); if (recording) finishRecording() }
    else setPlayT(d.t ?? null)
  })

  const play = (rec = false) => {
    if (scene.keys.length < 2) return toast('Add at least two keyframes (K) first.', 'warning')
    if (rec) setRecording(startRecording(rect))
    fetchNui('studio:play', { keys: [...scene.keys].sort((a, b) => a.t - b.t) })
    setPlayT(0)
  }
  const stopPlay = () => { fetchNui('studio:stop'); setPlayT(null); if (recording) finishRecording() }

  const finishRecording = async () => {
    const r = recording
    setRecording(null)
    if (!r) return
    const v = await r.stop()
    const id = uid('vid')
    setShots((s) => [{ id, thumb: '', blobUrl: v.blobUrl, width: v.width, height: v.height, status: 'saving', video: true }, ...s])
    try {
      const res = await upload({ dataUrl: v.dataUrl, thumb: '', width: v.width, height: v.height, ext: 'webm', blobUrl: v.blobUrl }, { name: `${scene.name} clip`, model: subject?.model, scene: scene.name })
      setShots((s) => s.map((x) => (x.id === id ? { ...x, status: res.ok ? 'saved' : 'failed', file: res.file, path: res.path, bytes: res.bytes } : x)))
      if (res.ok) toast(`Clip saved: ${res.file}`, 'success')
    } catch (e: any) {
      setShots((s) => s.map((x) => (x.id === id ? { ...x, status: 'failed' } : x)))
      toast(String(e.message || e), 'error')
    }
  }

  // Frame capture and export processing.
  const capture = async (label?: string) => {
    if (shooting) return
    const sc = live.current
    if (sc.output.matte !== 'none' && sc.backdrop.mode !== 'none') {
      const o = sc.stage.origin, c = camStore.get().p, hs = sc.backdrop.size / 2
      if (Math.abs(c.x - o.x) > hs - 0.2 || Math.abs(c.y - o.y) > hs - 0.2 || c.z < o.z || c.z > o.z + sc.backdrop.height - 0.1) {
        return toast('Move the camera inside the set for cut-outs and chroma, the backdrop has to surround it.', 'warning')
      }
    }
    setShooting('Capturing')
    setFlash((n) => n + 1)
    await nextFrame(); await nextFrame()
    let r
    try {
      r = await shoot(live.current, rect, camStore.get(), (p) => setShooting(p))
    } catch (e: any) {
      setShooting(null)
      return toast(`Capture failed: ${e.message || e}`, 'error')
    }
    setShooting(null)
    const id = uid('shot')
    setShots((s) => [{ id, thumb: r.thumb, blobUrl: r.blobUrl, width: r.width, height: r.height, status: 'saving', progress: 0 }, ...s])
    try {
      const res = await upload(r, { name: label ?? live.current.name, model: subjectOf(live.current)?.model, scene: live.current.name }, (p) => setShots((s) => s.map((x) => (x.id === id ? { ...x, progress: p } : x))))
      setShots((s) => s.map((x) => (x.id === id ? { ...x, status: res.ok ? 'saved' : 'failed', file: res.file, path: res.path, bytes: res.bytes, serverId: res.id } : x)))
      if (!res.ok) toast(res.msg || 'The server could not save the shot.', 'error')
    } catch (e: any) {
      setShots((s) => s.map((x) => (x.id === id ? { ...x, status: 'failed' } : x)))
      toast(String(e.message || e), 'error')
    }
  }

  const turntable = async (n: number) => {
    const subj = subjectOf(live.current)
    if (!subj) return toast('Mark a prop as the subject first.', 'warning')
    const base = { ...subj.rot }
    for (let i = 0; i < n; i++) {
      const rot = { ...base, z: base.z + (360 / n) * i }
      patchItem(subj.id, { rot })
      fetchNui('studio:item', { id: subj.id, pos: subj.pos, rot })
      await wait(450)
      await capture(`${live.current.name} ${String(i + 1).padStart(2, '0')}`)
    }
    patchItem(subj.id, { rot: base })
    fetchNui('studio:item', { id: subj.id, pos: subj.pos, rot: base })
    toast(`${n} turntable shots taken.`, 'success')
  }

  const allAngles = async () => {
    if (!live.current.shots.length) return toast('Save camera angles first (B).', 'warning')
    for (const s of live.current.shots) {
      fetchNui('studio:cam', { pos: s.pos, rot: s.rot, fov: s.fov, ease: 0 })
      await wait(500)
      await capture(`${live.current.name} ${s.name}`)
    }
  }

  // Active item reference for transform gizmo.
  const gizmoItem = selected && selected.visible ? selected : null
  const lights = scene.items.filter((i) => i.kind === 'light' && i.visible)
  const fxs = scene.items.filter((i) => i.kind === 'fx' && i.visible)

  return (
    <div className={cx('studio', clean && 'is-clean', shooting && 'is-shooting', picking && 'tool-point')}>
      <div className="viewport" ref={viewport} onMouseDown={onViewportDown} />

      {/* Frame: crop mask, guides, overlay preview */}
      {!(rect.w >= screen.w - 2 && rect.h >= screen.h - 2) && <div className="frame-mask" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.y}px, ${rect.x}px ${rect.y}px, ${rect.x}px ${rect.y + rect.h}px, ${rect.x + rect.w}px ${rect.y + rect.h}px, ${rect.x + rect.w}px ${rect.y}px, 0 ${rect.y}px)` }} />}
      <div className="frame" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
        {!shooting && scene.guides !== 'none' && <Guides kind={scene.guides} />}
        <canvas ref={overlayCanvas} className="frame-overlays" style={{ width: rect.w, height: rect.h }} />
        {!shooting && <span className="frame-size num">{rect.w}×{rect.h}{scene.output.width ? ` → ${scene.output.width}×${Math.round((scene.output.width / rect.w) * rect.h)}` : ''}</span>}
      </div>
      <div key={flash} className={cx('shutter', flash > 0 && 'is-firing')} />

      {/* World overlay: gizmo, subject box, light and effect pins */}
      {!shooting && (
        <svg className="overlay" width={screen.w} height={screen.h}>
          {lights.map((l) => {
            const p = project(l.pos, cam, screen)
            if (!p) return null
            const tgt = (l as any).aim && sel === l.id ? project(subjectCenter, cam, screen) : null
            return (
              <g key={l.id} className={cx('lpin', sel === l.id && 'is-on')}>
                {tgt && <line x1={p.x} y1={p.y} x2={tgt.x} y2={tgt.y} className="lpin-beam" />}
                <circle cx={p.x} cy={p.y} r={11} className="lpin-disc" style={{ fill: (l as any).color }} />
                <circle cx={p.x} cy={p.y} r={15} className="lpin-ring" />
              </g>
            )
          })}
          {fxs.map((f) => {
            const p = project(f.pos, cam, screen)
            if (!p) return null
            return <g key={f.id} className={cx('fxpin', sel === f.id && 'is-on')}><rect x={p.x - 8} y={p.y - 8} width={16} height={16} rx={3} transform={`rotate(45 ${p.x} ${p.y})`} /></g>
          })}
          {gizmoItem?.kind === 'prop' && dims[gizmoItem.model] && <Box cam={cam} screen={screen} pos={gizmoItem.pos} rot={gizmoItem.rot} dims={dims[gizmoItem.model]} />}
          {gizmoItem && !clean && (
            <Gizmo cam={cam} screen={screen} pos={gizmoItem.pos} rot={gizmoItem.rot} mode={mode} space={space} snapCfg={{ on: false, move: 0.05, turn: 15 }}
              onStart={() => {}} onEnd={() => setDrag(null)}
              onChange={(p, r, inf) => { patchItem(gizmoItem.id, { pos: p, rot: r }); fetchNui('studio:item', { id: gizmoItem.id, pos: p, rot: r }); setDrag(inf) }}
              onFree={async (sx, sy) => {
                const rr = ray(sx, sy, camStore.get(), screen)
                const hit = await fetchNui('studio:pick', { o: rr.o, d: rr.d, ignore: gizmoItem.id })
                if (hit?.hit) { patchItem(gizmoItem.id, { pos: hit.pos }); fetchNui('studio:item', { id: gizmoItem.id, pos: hit.pos, rot: gizmoItem.rot }) }
              }} />
          )}
        </svg>
      )}
      {drag && <div className="drag-chip num" style={{ left: drag.x + 18, top: drag.y + 18 }}>{drag.text}</div>}
      {shooting && <div className="shoot-status"><span className="rec-dot" />{shooting}</div>}
      {picking && <div className="tool-hint"><Icon name="CursorClick" size={15} />Click the spot the callout points at<Kbd dim>Esc</Kbd></div>}

      {/* Top bar */}
      <header className="studio-top">
        <span className="studio-name">
          <Icon name="Aperture" size={18} weight="duotone" className="tone-accent" />
          <input className="studio-name-input" value={scene.name} onChange={(e) => setScene((s) => ({ ...s, name: e.target.value }))} onKeyDown={(e) => e.stopPropagation()} spellCheck={false} />
          <IconBtn icon="FloppyDisk" title="Save scene (Ctrl+S)" onClick={saveScene} />
          <SceneMenu onLoad={loadScene} />
        </span>
        <span className="studio-aspects">
          {ASPECTS.map((a) => (
            <button key={a.id} type="button" title={a.hint} className={cx('aspect', scene.output.aspect === a.id && 'is-on')} onClick={() => setScene((s) => ({ ...s, output: { ...s.output, aspect: a.id } }))}>
              <span className="aspect-glyph" style={{ aspectRatio: String(a.ratio ?? screen.w / screen.h) }} />
              {a.label}
            </button>
          ))}
        </span>
        <span className="studio-top-right">
          <Select value={scene.guides} onChange={(v) => setScene((s) => ({ ...s, guides: v }))} options={[{ value: 'none', label: 'No guides' }, { value: 'thirds', label: 'Thirds' }, { value: 'center', label: 'Centre' }, { value: 'golden', label: 'Golden' }]} />
          <IconBtn icon={clean ? 'Eye' : 'EyeSlash'} title="Hide panels (H)" onClick={() => setClean((v) => !v)} />
          <Button size="s" variant="quiet" icon="X" onClick={exit}>Exit</Button>
        </span>
      </header>

      <Outliner scene={scene} setScene={setScene} sel={sel} setSel={setSel} dims={dims} models={models} />
      <Inspector scene={scene} setScene={setScene} sel={sel} setSel={setSel} dims={dims} patchItem={patchItem} removeItem={removeItem}
        start={start} focusSel={focusSel} addShot={addShot} setPicking={setPicking} subjectCenter={subjectCenter}
        moveStageTo={(mode) => setScene((s) => ({ ...moveStage(s, stageOrigin(start, mode), mode), backdrop: { ...s.backdrop, mode: mode === 'void' ? (s.backdrop.mode === 'none' ? 'sweep' : s.backdrop.mode) : 'none' } }))} />

      {/* Bottom: timeline, shot strip, capture dock */}
      <div className="studio-bottom">
        {timeline && <Timeline scene={scene} setScene={setScene} playT={playT} onClose={() => setTimeline(false)} play={play} stop={stopPlay} recording={!!recording} addKey={addKey} />}
        <div className="dock-row">
          <Strip shots={shots} onOpen={setLightbox} />
          <div className="capture-dock">
            <OutputMenu scene={scene} setScene={setScene} />
            <button type="button" className={cx('shutter-btn', shooting && 'is-busy')} onClick={() => capture()} title="Capture (Space)">
              <span className="shutter-ring" /><span className="shutter-core" />
            </button>
            <Menu align="right" trigger={(open) => <Button size="s" variant="ghost" icon="Stack" onClick={open}>Batch</Button>} items={[
              { label: 'Turntable, 8 shots', icon: 'ArrowsClockwise', hint: '45°', onClick: () => turntable(8) },
              { label: 'Turntable, 12 shots', icon: 'ArrowsClockwise', hint: '30°', onClick: () => turntable(12) },
              { label: 'Turntable, 24 shots', icon: 'ArrowsClockwise', hint: '15°', onClick: () => turntable(24) },
              'sep',
              { label: `Every saved angle (${scene.shots.length})`, icon: 'Camera', onClick: allAngles },
            ]} />
            <Button size="s" variant={timeline ? 'solid' : 'ghost'} icon="FilmStrip" onClick={() => setTimeline((v) => !v)}>Motion</Button>
          </div>
        </div>
      </div>

{clean && !shooting && (
        <button type="button" className="restore-ui" onClick={() => setClean(false)} title="Show panels (H)">
          <Icon name="Eye" size={15} /><span>Show panels</span><Kbd dim>H</Kbd>
        </button>
      )}
      {lightbox && <Lightbox shot={lightbox} model={subject?.model} onClose={() => setLightbox(null)} onDelete={(id) => { setShots((s) => s.filter((x) => x.id !== id)); setLightbox(null) }} />}
    </div>
  )
}

function Guides({ kind }: { kind: 'thirds' | 'center' | 'golden' }) {
  const f = kind === 'golden' ? 0.382 : 1 / 3
  return (
    <svg className="guides" viewBox="0 0 100 100" preserveAspectRatio="none">
      {kind === 'center'
        ? <><line x1="50" y1="0" x2="50" y2="100" /><line x1="0" y1="50" x2="100" y2="50" /><rect x="5" y="5" width="90" height="90" className="safe" /></>
        : <><line x1={f * 100} y1="0" x2={f * 100} y2="100" /><line x1={100 - f * 100} y1="0" x2={100 - f * 100} y2="100" /><line x1="0" y1={f * 100} x2="100" y2={f * 100} /><line x1="0" y1={100 - f * 100} x2="100" y2={100 - f * 100} /></>}
    </svg>
  )
}

function SceneMenu({ onLoad }: { onLoad: (s: any) => void }) {
  const [list, setList] = useState<{ id: string; name: string; model?: string; pack?: string }[] | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { if (open) rpc('scenes:list').then((r) => r?.ok && setList(r.scenes)) }, [open])
  return (
    <span className="menu-wrap">
      <IconBtn icon="Folder" title="Open a saved scene" onClick={() => setOpen((o) => !o)} active={open} />
      {open && (
        <span className="menu menu--left scene-menu" onMouseLeave={() => setOpen(false)}>
          {!list ? <span className="menu-empty">Loading…</span> : list.length === 0 ? <span className="menu-empty">No saved scenes yet. Ctrl+S saves this one.</span> : list.map((s) => (
            <button type="button" key={s.id} className="menu-item" onClick={async () => { setOpen(false); const r = await rpc('scene:get', { id: s.id }); if (r?.ok) onLoad(r.scene) }}>
              <Icon name="FilmSlate" size={15} />
              <span className="menu-label">{s.name}</span>
              <span className="menu-hint">{s.pack ?? s.model ?? ''}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

function OutputMenu({ scene, setScene }: { scene: Scene; setScene: (f: (s: Scene) => Scene) => void }) {
  const [open, setOpen] = useState(false)
  const o = scene.output
  const set = (p: Partial<Scene['output']>) => setScene((s) => ({ ...s, output: { ...s.output, ...p } }))
  const label = `${o.format.toUpperCase()}${o.matte === 'clean' ? ' · cut out' : o.matte === 'chroma' ? ' · keyed' : ''}${o.width ? ` · ${o.width}px` : ''}`
  return (
    <span className="menu-wrap">
      <Button size="s" variant={open ? 'solid' : 'ghost'} icon="SlidersHorizontal" onClick={() => setOpen((v) => !v)}>{label}</Button>
      {open && (
        <div className="popover output-pop" onMouseDown={(e) => e.stopPropagation()}>
          <div className="pop-head"><span>Output</span><IconBtn size="s" icon="X" onClick={() => setOpen(false)} /></div>
          <Field label="Background">
            <Segmented full size="s" value={o.matte} onChange={(v) => set({ matte: v, format: v !== 'none' && o.format === 'jpg' ? 'png' : o.format })} options={[
              { value: 'none', label: 'As seen' }, { value: 'clean', label: 'Cut out', hint: 'Two passes on black and white, exact edges and glass. Keep the scene still' }, { value: 'chroma', label: 'Chroma key', hint: 'One pass on the chroma backdrop, works with smoke and motion' },
            ]} />
          </Field>
          {o.matte === 'clean' && <p className="field-hint">Shoots twice (black, then white backdrop) and keeps only what did not change. Perfect for props, avoid moving smoke and peds.</p>}
          {o.matte === 'chroma' && (
            <div className="grid-2">
              <Field label="Tolerance"><Slider value={o.key.tol} min={0.02} max={0.5} step={0.01} onChange={(v) => set({ key: { ...o.key, tol: v } })} /></Field>
              <Field label="Softness"><Slider value={o.key.soft} min={0} max={0.4} step={0.01} onChange={(v) => set({ key: { ...o.key, soft: v } })} /></Field>
              <Field label="Spill removal"><Slider value={o.key.spill} min={0} max={1} step={0.05} onChange={(v) => set({ key: { ...o.key, spill: v } })} /></Field>
            </div>
          )}
          <div className="grid-2">
            <Field label="Format"><Segmented full size="s" value={o.format} onChange={(v) => set({ format: v })} options={[{ value: 'png', label: 'PNG' }, { value: 'webp', label: 'WebP' }, ...(o.matte === 'none' ? [{ value: 'jpg' as const, label: 'JPG' }] : [])]} /></Field>
            <Field label="Width"><Select value={String(o.width)} onChange={(v) => set({ width: +v })} options={[{ value: '0', label: 'Native' }, { value: '1080', label: '1080 px' }, { value: '1600', label: '1600 px' }, { value: '2048', label: '2048 px' }, { value: '3000', label: '3000 px' }]} /></Field>
          </div>
          {o.format !== 'png' && <Field label="Quality"><Slider value={o.quality} min={0.6} max={1} step={0.01} onChange={(v) => set({ quality: v })} format={(v) => `${Math.round(v * 100)}`} /></Field>}
          <Field label="Smoothing" hint="Averages several frames, removes shimmer on thin edges"><Segmented full size="s" value={String(o.frames)} onChange={(v) => set({ frames: +v })} options={[{ value: '1', label: 'Off' }, { value: '4', label: '4 frames' }, { value: '8', label: '8 frames' }]} /></Field>
          <div className="pop-sep" />
          <div className="grid-2">
            <Field label="Exposure"><Slider value={o.exposure} min={0.6} max={1.6} step={0.01} onChange={(v) => set({ exposure: v })} /></Field>
            <Field label="Contrast"><Slider value={o.contrast} min={0.6} max={1.6} step={0.01} onChange={(v) => set({ contrast: v })} /></Field>
            <Field label="Saturation"><Slider value={o.saturation} min={0} max={2} step={0.01} onChange={(v) => set({ saturation: v })} /></Field>
            <Field label="Vignette"><Slider value={o.vignette} min={0} max={0.8} step={0.01} onChange={(v) => set({ vignette: v })} /></Field>
          </div>
        </div>
      )}
    </span>
  )
}

function Strip({ shots, onOpen }: { shots: SessionShot[]; onOpen: (s: SessionShot) => void }) {
  if (!shots.length) return <div className="strip strip--empty"><Icon name="ImageSquare" size={18} weight="duotone" /><span>Shots land here. <Kbd dim>Space</Kbd> takes one.</span></div>
  return (
    <div className="strip">
      {shots.slice(0, 40).map((s) => (
        <button key={s.id} type="button" className={cx('strip-shot', `is-${s.status}`)} onClick={() => onOpen(s)} title={s.file ?? 'Saving…'}>
          {s.video ? <span className="strip-video"><Icon name="VideoCamera" size={18} /></span> : <img src={s.thumb} alt="" draggable={false} />}
          {s.status === 'saving' && <span className="strip-progress" style={{ transform: `scaleX(${s.progress ?? 0.1})` }} />}
          {s.status === 'failed' && <span className="strip-flag"><Icon name="WarningCircle" size={14} weight="fill" /></span>}
        </button>
      ))}
    </div>
  )
}

function Lightbox({ shot, model, onClose, onDelete }: { shot: SessionShot; model?: string; onClose: () => void; onDelete: (id: string) => void }) {
  const thumbIt = async () => {
    if (!model || !shot.serverId) return
    if (replied(await rpc('model:thumb', { model, shot: shot.serverId }), 'Library picture updated.')) app.set((s) => ({ thumbs: { ...s.thumbs, [shot.serverId!]: shot.thumb } }))
  }
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this shot?', body: 'The file on the server is deleted too.', confirm: 'Delete', tone: 'bad', icon: 'Trash' }))) return
    if (shot.serverId) await rpc('shot:delete', { id: shot.serverId })
    onDelete(shot.id)
  }
  return (
    <div className="scrim lightbox" onMouseDown={onClose}>
      <div className="lightbox-inner" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lightbox-media checker">
          {shot.video ? <video src={shot.blobUrl} controls autoPlay loop /> : <img src={shot.blobUrl ?? shot.thumb} alt="" />}
        </div>
        <aside className="lightbox-side">
          <div className="lightbox-meta">
            <span className="num">{shot.width}×{shot.height}</span>
            {shot.bytes ? <span className="num">{fmtBytes(shot.bytes)}</span> : null}
            <span className={cx('pill', shot.status === 'saved' ? 'pill--ok' : shot.status === 'failed' ? 'pill--bad' : '')}>{shot.status === 'saved' ? 'Saved' : shot.status === 'failed' ? 'Not saved' : 'Saving'}</span>
          </div>
          {shot.path && <Field label="File on the server"><Input value={shot.path} onChange={() => {}} mono /></Field>}
          <p className="field-hint">{shot.blobUrl ? 'FiveM does not let pages put images on the clipboard. Open the file from the path above, or set an upload in Config.Studio.upload to get a link.' : 'From an earlier session, only the preview is kept in the database. The full image is in the file above.'}</p>
          <div className="lightbox-actions">
            <Button variant="ghost" icon="Copy" onClick={() => copyText(shot.path ?? shot.file ?? '', 'File path copied.')} disabled={!shot.path && !shot.file}>Copy file path</Button>
            {shot.url && <Button variant="ghost" icon="Link" onClick={() => copyText(shot.url!, 'Link copied.')}>Copy link</Button>}
            <Button variant="ghost" icon="ImageSquare" onClick={thumbIt} disabled={!model || !shot.serverId || shot.video}>Use as library picture</Button>
            <Button variant="danger" icon="Trash" onClick={remove}>Delete</Button>
          </div>
        </aside>
        <IconBtn icon="X" title="Close (Esc)" onClick={onClose} />
      </div>
    </div>
  )
}

function Timeline({ scene, setScene, playT, onClose, play, stop, recording, addKey }: {
  scene: Scene; setScene: (f: (s: Scene) => Scene) => void; playT: number | null; onClose: () => void; play: (rec?: boolean) => void; stop: () => void; recording: boolean; addKey: () => void
}) {
  const keys = [...scene.keys].sort((a, b) => a.t - b.t)
  const total = Math.max(4, keys.length ? keys[keys.length - 1].t + 1 : 4)
  const setKey = (id: string, p: Partial<Scene['keys'][number]>) => setScene((s) => ({ ...s, keys: s.keys.map((k) => (k.id === id ? { ...k, ...p } : k)) }))
  return (
    <div className="timeline">
      <div className="tl-head">
        <span className="tl-title"><Icon name="FilmStrip" size={15} />Camera motion</span>
        <Button size="s" variant="ghost" icon="Plus" onClick={addKey} kbd="K">Key from view</Button>
        {playT === null
          ? <><Button size="s" variant="ghost" icon="Play" onClick={() => play(false)} disabled={keys.length < 2}>Play</Button>
            {canRecord() && <Button size="s" variant="ghost" icon="Record" onClick={() => play(true)} disabled={keys.length < 2} title="Records the frame as WebM while the path plays (experimental)">Record</Button>}</>
          : <Button size="s" variant={recording ? 'danger' : 'solid'} icon="Stop" onClick={stop}>{recording ? 'Stop recording' : 'Stop'}</Button>}
        <span className="flex-1" />
        <IconBtn size="s" icon="X" onClick={onClose} />
      </div>
      <div className="tl-track">
        {Array.from({ length: Math.ceil(total) + 1 }).map((_, i) => <span key={i} className="tl-tick num" style={{ left: `${(i / total) * 100}%` }}>{i}s</span>)}
        {keys.map((k, i) => (
          <button key={k.id} type="button" className="tl-key" style={{ left: `${(k.t / total) * 100}%` }}
            title={`Key ${i + 1} at ${k.t}s. Drag to retime, click to view, right click to delete`}
            onClick={() => fetchNui('studio:cam', { pos: k.pos, rot: k.rot, fov: k.fov, ease: 400 })}
            onContextMenu={(e) => { e.preventDefault(); setScene((s) => ({ ...s, keys: s.keys.filter((x) => x.id !== k.id) })) }}
            onMouseDown={(e) => {
              if (e.button !== 0) return
              const track = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
              const move = (ev: MouseEvent) => setKey(k.id, { t: Math.max(0, +(((ev.clientX - track.left) / track.width) * total).toFixed(2)) })
              const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
              window.addEventListener('mousemove', move)
              window.addEventListener('mouseup', up)
            }}>
            <span className="num">{i + 1}</span>
          </button>
        ))}
        {playT !== null && <span className="tl-head-line" style={{ left: `${(playT / total) * 100}%` }} />}
        {keys.length === 0 && <span className="tl-empty">Frame a view and press K to add a keyframe. Two or more make a move.</span>}
      </div>
    </div>
  )
}

