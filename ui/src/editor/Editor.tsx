import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchNui, useNuiEvent } from '../lib/nui'
import { camStore, toast, useApp, useCam, useScreenSize } from '../lib/store'
import { Icon, type IconName } from '../lib/icons'
import { Button, Field, IconBtn, Input, Kbd, NumberField, Section, Select, Slider, Switch, confirm } from '../kit/ui'
import { cx } from '../lib/format'
import { type V3, basis, local, pos4, ray, rot3, dist } from '../lib/math'
import { Box, DropLine, Gizmo, Pins, type DragInfo, type Mode, type Space } from './Gizmo'
import { useFly } from './fly'
import { hub } from '../hub/state'

type Dims = { min: V3; max: V3 }
type Settings = {
  label?: string; group?: string; mode?: 'local' | 'networked'; distance?: number; lod?: number
  collision?: boolean; freeze?: boolean; alpha?: number; inherit?: boolean; enabled?: boolean
}
type View = {
  kind: 'placement' | 'points'; id?: string; model: string; label: string; pos: V3; rot: V3; dims: Dims; settings: Settings
  anchor?: { model: number | string; pos: V3 }; points: { id: string; label: string; point: V3; radius?: number }[]
  pointsOnly?: boolean; focus?: string | boolean
}
type Info = { ground?: number; dist?: number; interior?: boolean; reach?: number }
type Tool = null | 'surface' | 'anchor'

const center = (pos: V3, rot: V3, d: Dims) => local(pos, basis(rot), { x: (d.min.x + d.max.x) / 2, y: (d.min.y + d.max.y) / 2, z: (d.min.z + d.max.z) / 2 })
const radiusOf = (d: Dims) => Math.max(0.3, dist(d.min, d.max) / 2)

export function Editor() {
  const view = useApp((s) => s.screenData) as View
  const boot = useApp((s) => s.boot)
  const cam = useCam()
  const screen = useScreenSize()
  const [pos, setPos] = useState<V3>(view.pos)
  const [rot, setRot] = useState<V3>(view.rot)
  const [dims] = useState<Dims>(view.dims)
  const [settings, setSettings] = useState<Settings>(view.settings ?? {})
  const [anchor, setAnchor] = useState(view.anchor)
  const [info, setInfo] = useState<Info>({})
  const [mode, setMode] = useState<Mode>('move')
  const [space, setSpace] = useState<Space>('world')
  const [snapOn, setSnapOn] = useState(false)
  const [moveStep, setMoveStep] = useState(0.1)
  const [turnStep, setTurnStep] = useState(15)
  const [tool, setTool] = useState<Tool>(null)
  const [align, setAlign] = useState(false)
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [hideUi, setHideUi] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [id, setId] = useState(view.id)
  const [pointDraft, setPointDraft] = useState<V3 | null>(() => hub.get().draft?.interaction.point ?? null)
  const viewport = useRef<HTMLDivElement>(null)
  const history = useRef<{ past: { pos: V3; rot: V3 }[]; future: { pos: V3; rot: V3 }[] }>({ past: [], future: [] })
  const state = useRef({ pos, rot })
  state.current = { pos, rot }
  const pointsOnly = view.pointsOnly
  const initial = useRef(JSON.stringify({ pos: view.pos, rot: view.rot, settings: view.settings, anchor: view.anchor }))
  const dirty = JSON.stringify({ pos, rot, settings, anchor }) !== initial.current

  useNuiEvent<Info>('editor:info', setInfo)
  useNuiEvent<{ id: string; next?: boolean }>('editor:saved', (d) => {
    setSavedCount((n) => n + 1)
    setId(undefined)
    setAnchor(undefined)
    initial.current = JSON.stringify({ pos: state.current.pos, rot: state.current.rot, settings, anchor: undefined })
    toast('Saved. Placing another, move it and press Enter.', 'success')
    if (d.next) setPos((p) => ({ ...p }))
  })

  // Throttles live transform updates to animation frame rate.
  const pending = useRef<{ pos: V3; rot: V3 } | null>(null)
  const push = useCallback((p: V3, r: V3) => {
    const first = !pending.current
    pending.current = { pos: p, rot: r }
    if (first) requestAnimationFrame(() => {
      if (pending.current) fetchNui('editor:set', { pos: pos4(pending.current.pos), rot: rot3(pending.current.rot) })
      pending.current = null
    })
  }, [])

  const commit = (p: V3, r: V3, record = true) => {
    if (record) {
      history.current.past.push({ pos: state.current.pos, rot: state.current.rot })
      if (history.current.past.length > 100) history.current.past.shift()
      history.current.future = []
    }
    setPos(p); setRot(r); push(p, r)
  }

  const undo = () => {
    const h = history.current
    const prev = h.past.pop()
    if (!prev) return
    h.future.push({ pos: state.current.pos, rot: state.current.rot })
    setPos(prev.pos); setRot(prev.rot); push(prev.pos, prev.rot)
  }
  const redo = () => {
    const h = history.current
    const next = h.future.pop()
    if (!next) return
    h.past.push({ pos: state.current.pos, rot: state.current.rot })
    setPos(next.pos); setRot(next.rot); push(next.pos, next.rot)
  }

  const setS = (p: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...p }))
    fetchNui('editor:settings', p)
  }

  const castFrom = (sx: number, sy: number, m: 'surface' | 'pick' | 'prop') => {
    const r = ray(sx, sy, camStore.get(), { w: window.innerWidth, h: window.innerHeight })
    return fetchNui('editor:raycast', { o: r.o, d: r.d, mode: m })
  }

  const ground = async (p = state.current.pos, r = state.current.rot, record = true) => {
    const res = await fetchNui('editor:ground', { pos: p, rot: r, align })
    if (!res?.ok) { if (res?.msg) toast(res.msg, 'warning'); return }
    commit(res.pos, res.rot, record)
  }

  // Surface raycast drag positioning.
  const surfaceBusy = useRef(false)
  const toSurface = async (sx: number, sy: number, record = false) => {
    if (surfaceBusy.current) return
    surfaceBusy.current = true
    const hit = await castFrom(sx, sy, 'surface')
    if (hit?.hit) {
      const res = await fetchNui('editor:ground', { pos: { ...hit.pos, z: hit.pos.z + 0.05 }, rot: state.current.rot, align })
      if (res?.ok) commit(res.pos, res.rot, record)
      else commit({ ...hit.pos }, state.current.rot, record)
    }
    surfaceBusy.current = false
  }

  const focus = () => fetchNui('cam:focus', { center: center(state.current.pos, state.current.rot, dims), radius: radiusOf(dims) * 1.4 })

  useFly({ center: () => center(state.current.pos, state.current.rot, dims), target: () => viewport.current })

  const save = async (another = false) => {
    if (pointsOnly) return done()
    setSaving(true)
    const res = await fetchNui('editor:save', { pos: pos4(pos), rot: rot3(rot), another, back: true })
    setSaving(false)
    if (res && res.ok === false) toast(res.msg || 'Could not save.', 'error')
  }
  const cancel = async () => {
    if (pointsOnly) return done()
    if (dirty && !(await confirm({ title: 'Leave without saving?', body: 'The prop goes back to where it was.', confirm: 'Leave', tone: 'bad' }))) return
    fetchNui('editor:cancel', { back: true })
  }
  const done = () => fetchNui('editor:points:done', { back: true })

  // Editor keyboard shortcut handlers.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (document.querySelector('.scrim')) return
      const key = e.key.toLowerCase()
      if (e.ctrlKey && key === 'z') { e.preventDefault(); return undo() }
      if (e.ctrlKey && (key === 'y' || (e.shiftKey && key === 'z'))) { e.preventDefault(); return redo() }
      if (e.ctrlKey) return
      if (key === 'escape') { if (tool) return setTool(null); return cancel() }
      if (key === 'enter') return save(e.shiftKey && !id)
      if (pointsOnly) return
      if (key === 'w') setMode('move')
      else if (key === 'e' || key === 'r') setMode('rotate')
      else if (key === 'q') setSpace((s) => (s === 'world' ? 'local' : 'world'))
      else if (key === 'g') ground()
      else if (key === 'f') focus()
      else if (key === 's') setTool((x) => (x === 'surface' ? null : 'surface'))
      else if (key === 'a') setTool((x) => (x === 'anchor' ? null : 'anchor'))
      else if (key === 'x') setSnapOn((v) => !v)
      else if (key === 'h') setHideUi((v) => !v)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  // Viewport interaction click handlers.
  const onViewportDown = async (e: React.MouseEvent) => {
    if (e.button !== 0 || e.altKey || e.target !== viewport.current) return
    if (pointsOnly) {
      const hit = await castFrom(e.clientX, e.clientY, 'prop')
      if (!hit?.hit || !hit.local_) return toast('Click on the prop itself.', 'warning')
      setPointDraft(hit.local_)
      hub.set((v) => (v.draft ? { draft: { ...v.draft, interaction: { ...v.draft.interaction, point: hit.local_ }, dirty: true } } : {}))
      return
    }
    if (tool === 'surface') {
      history.current.past.push({ pos: state.current.pos, rot: state.current.rot })
      await toSurface(e.clientX, e.clientY, false)
      return
    }
    if (tool === 'anchor') {
      const hit = await castFrom(e.clientX, e.clientY, 'pick')
      if (!hit?.entity) return toast('Click a map object (a prop the map already has).', 'warning')
      if (hit.placement) return toast('That is a PropKit prop. Anchor to map objects only.', 'warning')
      const res = await fetchNui('editor:anchor', { entity: hit.entity })
      if (res?.ok) { setAnchor(res.anchor); setTool(null); toast('Anchored. It now follows that object wherever this client has it.', 'success') }
    }
  }

  const activeId = typeof view.focus === 'string' ? view.focus : hub.get().draft?.interaction.id
  const pins = useMemo(() => {
    const list = (view.points ?? []).filter((p) => p.id !== activeId)
    if (pointsOnly && pointDraft) list.push({ id: activeId ?? 'new', label: hub.get().draft?.interaction.label ?? 'This interaction', point: pointDraft, radius: hub.get().draft?.interaction.radius })
    return list
  }, [view.points, pointDraft, activeId, pointsOnly])

  const tooFar = info.dist !== undefined && info.reach !== undefined && info.dist > info.reach
  const snapMoves = boot?.editor.snapMove ?? [0.01, 0.05, 0.1, 0.25, 0.5, 1]
  const snapTurns = boot?.editor.snapTurn ?? [1, 5, 15, 45, 90]

  return (
    <div className={cx('editor', tool && `tool-${tool}`, pointsOnly && 'tool-point', hideUi && 'is-clean')}>
      <div className="viewport" ref={viewport} onMouseDown={onViewportDown} />
      <svg className="overlay" width={screen.w} height={screen.h}>
        <Box cam={cam} screen={screen} pos={pos} rot={rot} dims={dims} />
        {!pointsOnly && <DropLine cam={cam} screen={screen} pos={pos} rot={rot} dims={dims} ground={info.ground} />}
        <Pins cam={cam} screen={screen} pos={pos} rot={rot} points={pins} activeId={pointsOnly ? activeId : undefined} showRadius={pointsOnly} />
        {!pointsOnly && (
          <Gizmo cam={cam} screen={screen} pos={pos} rot={rot} mode={mode} space={space}
            snapCfg={{ on: snapOn, move: moveStep, turn: turnStep }}
            onStart={() => { history.current.past.push({ pos: state.current.pos, rot: state.current.rot }); history.current.future = [] }}
            onChange={(p, r, inf) => { setPos(p); setRot(r); push(p, r); setDrag(inf) }}
            onEnd={() => setDrag(null)}
            onFree={(sx, sy) => toSurface(sx, sy, false)} />
        )}
      </svg>
      {drag && <div className="drag-chip num" style={{ left: drag.x + 18, top: drag.y + 18 }}>{drag.text}</div>}

      {hideUi && (
        <button type="button" className="restore-ui" onClick={() => setHideUi(false)} title="Show panels (H)">
          <Icon name="Eye" size={15} /><span>Show panels</span><Kbd dim>H</Kbd>
        </button>
      )}
      {!hideUi && <>
        {/* Toolbar */}
        <div className="toolbar ui-scale-top">
          {pointsOnly ? (
            <div className="tb-group tb-note">
              <Icon name="CursorClick" size={16} className="tone-accent" />
              <span>Click the prop where <b>{hub.get().draft?.interaction.label ?? 'the interaction'}</b> should be</span>
              {pointDraft && <span className="num tb-readout">{pointDraft.x.toFixed(3)}, {pointDraft.y.toFixed(3)}, {pointDraft.z.toFixed(3)}</span>}
              <Button variant="primary" size="s" icon="Check" onClick={done}>Done</Button>
            </div>
          ) : <>
            <div className="tb-group">
              <TbBtn icon="ArrowsOutCardinal" label="Move" k="W" on={mode === 'move'} onClick={() => setMode('move')} />
              <TbBtn icon="ArrowsClockwise" label="Rotate" k="E" on={mode === 'rotate'} onClick={() => setMode('rotate')} />
            </div>
            <div className="tb-group">
              <TbBtn icon={space === 'world' ? 'Globe' : 'CubeFocus'} label={space === 'world' ? 'World' : 'Local'} k="Q" onClick={() => setSpace((s) => (s === 'world' ? 'local' : 'world'))} />
              <TbBtn icon="Magnet" label="Snap" k="X" on={snapOn} onClick={() => setSnapOn((v) => !v)} />
              <span className="tb-select">
                <select value={mode === 'move' ? moveStep : turnStep} onChange={(e) => (mode === 'move' ? setMoveStep(+e.target.value) : setTurnStep(+e.target.value))}>
                  {(mode === 'move' ? snapMoves : snapTurns).map((v) => <option key={v} value={v}>{mode === 'move' ? `${v} m` : `${v}°`}</option>)}
                </select>
              </span>
            </div>
            <div className="tb-group">
              <TbBtn icon="Selection" label="Surface" k="S" on={tool === 'surface'} onClick={() => setTool((t) => (t === 'surface' ? null : 'surface'))} />
              <TbBtn icon="ArrowLineDown" label="Ground" k="G" onClick={() => ground()} />
              <TbBtn icon="Anchor" label="Anchor" k="A" on={tool === 'anchor' || !!anchor} onClick={() => setTool((t) => (t === 'anchor' ? null : 'anchor'))} />
            </div>
            <div className="tb-group">
              <TbBtn icon="Target" label="Focus" k="F" onClick={focus} />
              <IconBtn icon="ArrowUUpLeft" title="Undo (Ctrl+Z)" onClick={undo} disabled={!history.current.past.length} />
              <IconBtn icon="ArrowUUpRight" title="Redo (Ctrl+Y)" onClick={redo} disabled={!history.current.future.length} />
            </div>
          </>}
        </div>
        {tool && (
          <div className="tool-hint">
            <Icon name={tool === 'surface' ? 'Selection' : 'Anchor'} size={15} />
            {tool === 'surface' ? 'Click any surface to rest the prop on it' : 'Click the map object this prop belongs on'}
            <Kbd dim>Esc</Kbd>
          </div>
        )}

        {/* Inspector */}
        {!pointsOnly && (
          <aside className="inspector ui-scale-right">
            <header className="insp-head">
              <span className="insp-title">{view.label}</span>
              <span className="insp-sub num">{view.model}</span>
              <span className={cx('insp-badge', !id && 'is-new')}>{id ? 'Editing' : savedCount ? `New · ${savedCount} placed` : 'New'}</span>
            </header>
            <div className="insp-scroll">
              <Section title="Position" aside={<span className="section-aside-text">metres</span>}>
                <div className="vec-edit">
                  {(['x', 'y', 'z'] as const).map((k) => (
                    <NumberField key={k} axis={k} value={pos[k]} step={0.01} precision={4} onChange={(v) => commit({ ...pos, [k]: v }, rot)} />
                  ))}
                </div>
              </Section>
              <Section title="Rotation" aside={<button type="button" className="link" onClick={() => commit(pos, { x: 0, y: 0, z: rot.z })}>Level it</button>}>
                <div className="vec-edit">
                  <NumberField axis="x" label="P" value={rot.x} step={0.5} precision={3} onChange={(v) => commit(pos, { ...rot, x: v })} />
                  <NumberField axis="y" label="R" value={rot.y} step={0.5} precision={3} onChange={(v) => commit(pos, { ...rot, y: v })} />
                  <NumberField axis="z" label="Y" value={rot.z} step={0.5} precision={3} onChange={(v) => commit(pos, { ...rot, z: v })} />
                </div>
                <div className="nudges">
                  {[-90, -15, -1, 1, 15, 90].map((d) => <button key={d} type="button" className="nudge num" onClick={() => commit(pos, { ...rot, z: rot.z + d })}>{d > 0 ? `+${d}` : d}°</button>)}
                </div>
              </Section>
              <div className="readouts">
                <span className={cx('readout', info.ground !== undefined && info.ground < -0.01 && 'is-warn')}>
                  <span className="readout-label">Above ground</span>
                  <span className="readout-value num">{info.ground === undefined || info.ground === null ? '—' : `${info.ground.toFixed(3)} m`}</span>
                </span>
                <span className={cx('readout', tooFar && 'is-warn')}>
                  <span className="readout-label">From you</span>
                  <span className="readout-value num">{info.dist === undefined ? '—' : `${info.dist.toFixed(1)} m`}</span>
                </span>
                <span className="readout">
                  <span className="readout-label">Interior</span>
                  <span className="readout-value">{info.interior ? 'Yes, saved' : 'No'}</span>
                </span>
              </div>
              <Switch checked={align} onChange={setAlign} label="Tilt to the surface" hint="Ground and Surface also match the slope under the prop" />
              {anchor && (
                <div className="callout">
                  <Icon name="Anchor" size={16} weight="duotone" />
                  <span>Anchored to map object <span className="num">{String(anchor.model)}</span>. If it cannot be found the prop stays at these exact coordinates.</span>
                  <button type="button" className="link" onClick={async () => { await fetchNui('editor:anchor', { clear: true }); setAnchor(undefined) }}>Remove</button>
                </div>
              )}
              <Section title="Placement">
                <div className="grid-2">
                  <Field label="Label"><Input value={settings.label ?? ''} onChange={(v) => setS({ label: v })} placeholder={view.label} /></Field>
                  <Field label="Group"><Input value={settings.group ?? ''} onChange={(v) => setS({ group: v })} placeholder="None" /></Field>
                </div>
                <Field label="Mode">
                  <Select value={settings.mode ?? 'inherit'} onChange={(v) => setS({ mode: v === 'inherit' ? undefined : (v as any) })} options={[
                    { value: 'inherit', label: 'From the model' }, { value: 'local', label: 'Local' }, { value: 'networked', label: 'Networked' },
                  ]} />
                </Field>
                <Field label="Spawn distance" aside={<Switch checked={settings.distance === undefined} onChange={(v) => setS({ distance: v ? undefined : boot?.stream.distance ?? 120 })} label="Model" />}>
                  {settings.distance !== undefined && <Slider value={settings.distance} min={10} max={1500} step={5} onChange={(v) => setS({ distance: v })} format={(v) => `${v} m`} />}
                </Field>
                <Field label="Opacity">
                  <Slider value={settings.alpha ?? 255} min={0} max={255} step={1} onChange={(v) => setS({ alpha: v >= 255 ? undefined : v })} format={(v) => `${Math.round((v / 255) * 100)}%`} />
                </Field>
              </Section>
            </div>
            <footer className="insp-foot">
              <Button variant="quiet" size="s" onClick={cancel} kbd="Esc">Cancel</Button>
              {!id && <Button variant="ghost" size="s" icon="Stack" onClick={() => save(true)} busy={saving} title="Save and keep placing copies (Shift+Enter)">Save + next</Button>}
              <Button variant="primary" size="s" icon="Check" onClick={() => save(false)} busy={saving} kbd="↵">Save</Button>
            </footer>
          </aside>
        )}

        <div className="hints">
          <span><Kbd dim>RMB</Kbd>+<Kbd dim>WASD</Kbd> fly</span>
          <span><Kbd dim>MMB</Kbd> orbit</span>
          <span><Kbd dim>Shift</Kbd>+<Kbd dim>MMB</Kbd> pan</span>
          <span><Kbd dim>Wheel</Kbd> zoom</span>
          {!pointsOnly && <><span><Kbd dim>Ctrl</Kbd> invert snap</span><span><Kbd dim>Shift</Kbd> fine</span></>}
          <span><Kbd dim>H</Kbd> hide panels</span>
          {cam.speed && <span className="num">{cam.speed.toFixed(1)} m/s</span>}
        </div>
      </>}
    </div>
  )
}

function TbBtn({ icon, label, k, on, onClick }: { icon: IconName; label: string; k: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={cx('tb-btn', on && 'is-on')} onClick={onClick} title={`${label} (${k})`}>
      <Icon name={icon} size={16} weight={on ? 'fill' : 'regular'} />
      <span className="tb-label">{label}</span>
      <kbd className="tb-key">{k}</kbd>
    </button>
  )
}

