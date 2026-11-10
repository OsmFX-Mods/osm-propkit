import { useApp } from '../lib/store'
import { fetchNui } from '../lib/nui'
import { Icon, type IconName } from '../lib/icons'
import { Button, ColorField, Combo, Field, IconBtn, Input, Menu, NumberField, Section, Segmented, Select, Slider, Switch, TextArea } from '../kit/ui'
import { cx, uid } from '../lib/format'
import { type V3, add, basis, dist, lookAt, kelvin, hex } from '../lib/math'
import type { Model } from '../lib/types'
import type { Dims } from './Studio'
import { type Item, type Overlay, type Scene, type LightItem, type PropItem, type PedItem, type FxItem, type BoardItem, newLight, lightColor } from './scene'
import { camStore } from '../lib/store'

type SetScene = (f: (s: Scene) => Scene) => void

const KIND_ICON: Record<Item['kind'], IconName> = { prop: 'Cube', ped: 'PersonSimple', light: 'Lightbulb', fx: 'Sparkle', board: 'Monitor' }
const OVERLAY_ICON: Record<Overlay['kind'], IconName> = { text: 'TextT', logo: 'Diamond', callout: 'ChatText' }

function inFront(d = 1.5): V3 {
  const c = camStore.get()
  const f = basis(c.r).f
  return add(c.p, f, d)
}

// Outliner -------------------------------------------------------------------------------------------------

export function Outliner({ scene, setScene, sel, setSel, dims, models }: { scene: Scene; setScene: SetScene; sel: string; setSel: (id: string) => void; dims: Dims; models: Record<string, Model> }) {
  const cat = useApp((s) => s.boot?.catalog)
  const o = scene.stage.origin
  const add_ = (it: Item) => { setScene((s) => ({ ...s, items: [...s.items, it] })); setSel(it.id) }
  const addOverlay = (ov: Overlay) => { setScene((s) => ({ ...s, overlays: [...s.overlays, ov] })); setSel(ov.id) }
  const toggle = (id: string) => setScene((s) => ({ ...s, items: s.items.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)) }))
  const base = (name: string, pos: V3) => ({ id: uid('it'), name, visible: true, pos, rot: { x: 0, y: 0, z: 0 } })

  const groups: { title: string; kinds: Item['kind'][]; add: { label: string; icon: IconName; hint?: string; onClick: () => void }[] }[] = [
    { title: 'Props', kinds: ['prop'], add: [
      ...Object.values(models).slice(0, 12).map((m) => ({ label: m.label, icon: 'Cube' as IconName, hint: m.model, onClick: () => add_({ ...base(m.label, inFront(2)), kind: 'prop', model: m.model, subject: !scene.items.some((i) => i.kind === 'prop' && (i as PropItem).subject) } as PropItem) })),
      { label: 'Any model…', icon: 'MagnifyingGlass', onClick: () => add_({ ...base('prop', inFront(2)), kind: 'prop', model: 'prop_mp_cone_02' } as PropItem) },
    ] },
    { title: 'People', kinds: ['ped'], add: [
      { label: 'Me (a copy of my character)', icon: 'User', onClick: () => add_({ ...base('Me', add(o, { x: 0.9, y: 0.2, z: 0 })), kind: 'ped', clone: true, rot: { x: 0, y: 0, z: 160 } } as PedItem) },
      ...(cat?.peds ?? []).slice(0, 10).map((p) => ({ label: p.label, icon: 'PersonSimple' as IconName, hint: p.model, onClick: () => add_({ ...base(p.label, add(o, { x: 0.9, y: 0.2, z: 0 })), kind: 'ped', model: p.model, scenario: 'WORLD_HUMAN_CLIPBOARD', rot: { x: 0, y: 0, z: 160 } } as PedItem) })),
    ] },
    { title: 'Lights', kinds: ['light'], add: [
      { label: 'Key light', icon: 'Lightbulb', hint: 'Main, warm', onClick: () => add_(newLight('key', o)) },
      { label: 'Fill light', icon: 'Lightbulb', hint: 'Soft, cool', onClick: () => add_(newLight('fill', o)) },
      { label: 'Rim light', icon: 'Lightbulb', hint: 'Edge from behind', onClick: () => add_(newLight('rim', o)) },
      { label: 'Top light', icon: 'Lightbulb', hint: 'Overhead', onClick: () => add_(newLight('top', o)) },
      { label: 'Practical', icon: 'Lightbulb', hint: 'Small warm point', onClick: () => add_(newLight('practical', o)) },
    ] },
    { title: 'Effects', kinds: ['fx'], add: (cat?.ptfx ?? []).map((f) => ({ label: f.label, icon: 'Sparkle' as IconName, hint: f.asset, onClick: () => add_({ ...base(f.label, add(o, { x: 0, y: 0, z: 0.6 })), kind: 'fx', asset: f.asset, effect: f.name, scale: f.scale } as FxItem) })) },
    { title: 'Brand walls', kinds: ['board'], add: [
      { label: 'Brand wall', icon: 'Monitor', hint: 'DUI screen behind the subject', onClick: () => add_({ ...base('Brand wall', add(o, { x: 0, y: 3.2, z: 1.6 })), kind: 'board', rot: { x: 0, y: 0, z: 180 }, size: { w: 6.4, h: 3.6 }, board: { bg: '#121216', bg2: '#26262e', title: 'OsmFX', sub: 'Props built for roleplay', logo: true, align: 'left', accent: '#ff8a3d' } } as BoardItem) },
    ] },
  ]

  return (
    <aside className="outliner ui-scale-left">
      <div className="ol-scroll">
        <button type="button" className={cx('ol-row ol-row--top', sel === 'scene' && 'is-on')} onClick={() => setSel('scene')}>
          <Icon name="Planet" size={15} /><span className="ol-name">Stage and light</span><span className="ol-hint">{scene.stage.mode === 'void' ? 'Closed' : 'Open'}</span>
        </button>
        <button type="button" className={cx('ol-row ol-row--top', sel === 'camera' && 'is-on')} onClick={() => setSel('camera')}>
          <Icon name="VideoCamera" size={15} /><span className="ol-name">Camera</span><span className="ol-hint num">{scene.camera.fov.toFixed(0)}°</span>
        </button>
        {groups.map((g) => {
          const items = scene.items.filter((i) => g.kinds.includes(i.kind))
          return (
            <div key={g.title} className="ol-group">
              <div className="ol-head">
                <span>{g.title}</span>
                <Menu align="left" trigger={(open) => <IconBtn size="s" icon="Plus" title={`Add to ${g.title.toLowerCase()}`} onClick={open} />} items={g.add} />
              </div>
              {items.map((i) => (
                <div key={i.id} className={cx('ol-row group', sel === i.id && 'is-on', !i.visible && 'is-hidden')} onClick={() => setSel(i.id)}>
                  <Icon name={KIND_ICON[i.kind]} size={15} style={i.kind === 'light' ? { color: (i as LightItem).color } : undefined} />
                  <span className="ol-name">{i.name}</span>
                  {i.kind === 'prop' && (i as PropItem).subject && <span className="ol-tag">subject</span>}
                  {i.kind === 'prop' && !dims[(i as PropItem).model] && <span className="ol-tag tone-faint">…</span>}
                  <button type="button" className="ol-eye" title={i.visible ? 'Hide' : 'Show'} onClick={(e) => { e.stopPropagation(); toggle(i.id) }}>
                    <Icon name={i.visible ? 'Eye' : 'EyeSlash'} size={14} />
                  </button>
                </div>
              ))}
            </div>
          )
        })}
        <div className="ol-group">
          <div className="ol-head">
            <span>On top of the image</span>
            <Menu align="left" trigger={(open) => <IconBtn size="s" icon="Plus" title="Add an overlay" onClick={open} />} items={[
              { label: 'Headline', icon: 'TextT', onClick: () => addOverlay({ id: uid('ov'), kind: 'text', text: 'New prop', x: 0.07, y: 0.14, size: 0.075, weight: 800, color: '#f4f4f0', align: 'left' }) },
              { label: 'Caption', icon: 'TextT', onClick: () => addOverlay({ id: uid('ov'), kind: 'text', text: 'Available now', x: 0.07, y: 0.2, size: 0.032, weight: 600, color: '#c9c9c4', align: 'left', upper: true, tracking: 0.14 }) },
              { label: 'Price tag', icon: 'Tag', onClick: () => addOverlay({ id: uid('ov'), kind: 'text', text: '$24.99', x: 0.93, y: 0.92, size: 0.05, weight: 800, color: '#ff8a3d', align: 'right', mono: true, plate: true }) },
              { label: 'OsmFX logo', icon: 'Diamond', onClick: () => addOverlay({ id: uid('ov'), kind: 'logo', src: 'osmfx', x: 0.06, y: 0.86, size: 0.07, opacity: 1 }) },
              { label: 'Logo from a link', icon: 'Image', onClick: () => addOverlay({ id: uid('ov'), kind: 'logo', src: 'https://', x: 0.06, y: 0.86, size: 0.08, opacity: 1 }) },
              { label: 'Interaction callout', icon: 'ChatText', hint: 'Points at a spot on the prop', onClick: () => addOverlay({ id: uid('ov'), kind: 'callout', point: { ...scene.stage.origin, z: scene.stage.origin.z + 0.5 }, label: 'Inflate tyre', sub: 'Hold to fill', key: 'E', side: 'auto' }) },
            ]} />
          </div>
          {scene.overlays.map((ov) => (
            <div key={ov.id} className={cx('ol-row group', sel === ov.id && 'is-on')} onClick={() => setSel(ov.id)}>
              <Icon name={OVERLAY_ICON[ov.kind]} size={15} />
              <span className="ol-name">{ov.kind === 'text' ? ov.text.split('\n')[0] : ov.kind === 'logo' ? (ov.src === 'osmfx' ? 'OsmFX logo' : 'Logo') : ov.label}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

// Inspector ------------------------------------------------------------------------------------------------

function Transform({ it, patch, onGround, onFocus }: { it: Item; patch: (p: Partial<Item>) => void; onGround?: () => void; onFocus: () => void }) {
  const push = (p: Partial<Item>) => { patch(p); fetchNui('studio:item', { id: it.id, pos: p.pos ?? it.pos, rot: p.rot ?? it.rot }) }
  return (
    <Section title="Transform" aside={<>{onGround && <IconBtn size="s" icon="ArrowLineDown" title="Rest on the ground" onClick={onGround} />}<IconBtn size="s" icon="Target" title="Frame it (F)" onClick={onFocus} /></>}>
      <div className="vec-edit">
        {(['x', 'y', 'z'] as const).map((k) => <NumberField key={k} axis={k} value={it.pos[k]} step={0.01} precision={3} onChange={(v) => push({ pos: { ...it.pos, [k]: v } })} />)}
      </div>
      <div className="vec-edit">
        <NumberField axis="x" label="P" value={it.rot.x} step={0.5} precision={1} onChange={(v) => push({ rot: { ...it.rot, x: v } })} />
        <NumberField axis="y" label="R" value={it.rot.y} step={0.5} precision={1} onChange={(v) => push({ rot: { ...it.rot, y: v } })} />
        <NumberField axis="z" label="Y" value={it.rot.z} step={0.5} precision={1} onChange={(v) => push({ rot: { ...it.rot, z: v } })} />
      </div>
    </Section>
  )
}

export function Inspector({ scene, setScene, sel, setSel, dims, patchItem, removeItem, start, focusSel, addShot, setPicking, subjectCenter, moveStageTo }: {
  scene: Scene; setScene: SetScene; sel: string; setSel: (id: string) => void; dims: Dims; patchItem: (id: string, p: Partial<Item>) => void; removeItem: (id: string) => void
  start: any; focusSel: () => void; addShot: () => void; setPicking: (id: string | null) => void; subjectCenter: V3; moveStageTo: (m: 'here' | 'void') => void
}) {
  const cat = useApp((s) => s.boot?.catalog)
  const models = useApp((s) => s.models)
  const it = scene.items.find((i) => i.id === sel)
  const ov = scene.overlays.find((o) => o.id === sel)
  const setEnv = (p: Partial<Scene['env']>) => setScene((s) => ({ ...s, env: { ...s.env, ...p } }))
  const setBd = (p: Partial<Scene['backdrop']>) => setScene((s) => ({ ...s, backdrop: { ...s.backdrop, ...p } }))
  const setCam = (p: Partial<Scene['camera']>) => setScene((s) => ({ ...s, camera: { ...s.camera, ...p } }))
  const setOv = (p: Partial<Overlay>) => setScene((s) => ({ ...s, overlays: s.overlays.map((o) => (o.id === sel ? ({ ...o, ...p } as Overlay) : o)) }))

  const ground = async () => {
    if (!it) return
    const r = await fetchNui('studio:ground', { id: it.id })
    if (r?.ok) { patchItem(it.id, { pos: r.pos }); fetchNui('studio:item', { id: it.id, pos: r.pos, rot: it.rot }) }
  }

  const head = (icon: IconName, title: string, extra?: React.ReactNode) => (
    <header className="insp-head">
      <Icon name={icon} size={16} weight="duotone" className="tone-accent" />
      <span className="insp-title">{title}</span>
      {extra}
    </header>
  )

  let body: React.ReactNode = null

  if (sel === 'scene') {
    const t = scene.env.time.h + scene.env.time.m / 60
    body = (
      <>
        {head('Planet', 'Stage and light')}
        <div className="insp-scroll">
          <Section title="Stage">
            <Segmented full value={scene.stage.mode} onChange={moveStageTo} options={[
              { value: 'void', label: 'Closed set', icon: 'Cube', hint: 'A backdrop on every side, nothing of the world shows' },
              { value: 'here', label: 'Open world', icon: 'MapPin', hint: 'The real world around you is the background' },
            ]} />
            <p className="field-hint">{scene.stage.mode === 'void' ? 'Built where you stand. The backdrop closes it off, so only your lights and backdrop make the picture. Widen it if a wall cuts through something.' : 'The world is the background. Add a backdrop to block it out locally.'}</p>
          </Section>
          <Section title="Backdrop">
            <Segmented full size="s" value={scene.backdrop.mode} onChange={(v) => setBd({ mode: v })} options={[{ value: 'none', label: 'None' }, { value: 'sweep', label: 'Sweep' }, { value: 'chroma', label: 'Chroma' }]} />
            {scene.backdrop.mode === 'sweep' && (
              <>
                <Field label="Floor colour"><ColorField value={scene.backdrop.bottom} onChange={(v) => setBd({ bottom: v })} swatches={['#2a2a30', '#3a3530', '#ebe7e0', '#1c2430', '#30201a', '#ff8a3d', '#101012']} /></Field>
                <Field label="Top colour"><ColorField value={scene.backdrop.top} onChange={(v) => setBd({ top: v })} swatches={['#0d0d10', '#16161a', '#cfc9bf', '#0c1118', '#140c08', '#000000']} /></Field>
              </>
            )}
            {scene.backdrop.mode === 'chroma' && <Field label="Key colour"><ColorField value={scene.backdrop.chroma} onChange={(v) => setBd({ chroma: v })} swatches={['#00ff40', '#0047ff', '#ff00d4']} /></Field>}
            {scene.backdrop.mode !== 'none' && (
              <div className="grid-2">
                <Field label="Width"><Slider value={scene.backdrop.size} min={4} max={40} step={1} onChange={(v) => setBd({ size: v })} format={(v) => `${v} m`} /></Field>
                <Field label="Height"><Slider value={scene.backdrop.height} min={2} max={20} step={0.5} onChange={(v) => setBd({ height: v })} format={(v) => `${v} m`} /></Field>
              </div>
            )}
            {scene.backdrop.mode !== 'none' && <Switch checked={scene.backdrop.floor} onChange={(v) => setBd({ floor: v })} label="Backdrop floor" hint="Off shows the real ground under the subject" />}
          </Section>
          <Section title="Time and weather">
            <Field label="Time" aside={<span className="num field-aside">{String(scene.env.time.h).padStart(2, '0')}:{String(scene.env.time.m).padStart(2, '0')}</span>}>
              <Slider value={t} min={0} max={23.75} step={0.25} onChange={(v) => setEnv({ time: { h: Math.floor(v), m: Math.round((v % 1) * 60) } })} format={() => ''} />
            </Field>
            <p className="field-hint">Night (22 to 4) leaves only your lights on the subject, the classic studio look.</p>
            <div className="grid-2">
              <Field label="Weather"><Select value={scene.env.weather} onChange={(v) => setEnv({ weather: v })} options={(cat?.weathers ?? []).map((w) => ({ value: w, label: w[0] + w.slice(1).toLowerCase() }))} /></Field>
              <Field label="Look"><Select value={scene.env.look.name} onChange={(v) => setEnv({ look: { ...scene.env.look, name: v } })} options={(cat?.looks ?? []).map((l) => ({ value: l.name, label: l.label }))} /></Field>
            </div>
            {scene.env.look.name && <Field label="Look strength"><Slider value={scene.env.look.strength} min={0} max={1} step={0.01} onChange={(v) => setEnv({ look: { ...scene.env.look, strength: v } })} /></Field>}
          </Section>
          <Section title="Detail">
            <Field label="Detail boost" hint="Off (1.00×) is safest. Raising it streams the map at a larger radius, so it is capped at 1.25×">
              <Slider value={Math.min(scene.env.lodScale, 1.25)} min={1} max={1.25} step={0.05} onChange={(v) => setEnv({ lodScale: v })} format={(v) => (v <= 1.001 ? 'Off' : `${v.toFixed(2)}×`)} />
            </Field>
            <Switch checked={scene.env.parkPed} onChange={(v) => setEnv({ parkPed: v })} label="Keep me hidden next to the subject" hint="GTA lowers detail by distance from your character. Parking it invisibly beside the prop keeps the prop at full detail" />
          </Section>
        </div>
      </>
    )
  } else if (sel === 'camera') {
    const focal = 12 / Math.tan((scene.camera.fov * Math.PI) / 360)
    const c = camStore.get()
    body = (
      <>
        {head('VideoCamera', 'Camera')}
        <div className="insp-scroll">
          <Section title="Lens">
            <Field label="Field of view" aside={<span className="num field-aside">{scene.camera.fov.toFixed(0)}° · {focal.toFixed(0)} mm</span>}>
              <Slider value={scene.camera.fov} min={8} max={90} step={1} onChange={(v) => setCam({ fov: v })} format={(v) => `${v}°`} />
            </Field>
            <div className="nudges">
              {[[24, 'Wide'], [35, ''], [50, 'Normal'], [85, 'Portrait'], [135, 'Tele']].map(([mm, l]) => (
                <button key={mm} type="button" className="nudge" onClick={() => setCam({ fov: +(2 * Math.atan(12 / +mm) * 180 / Math.PI).toFixed(1) })}><span className="num">{mm}</span>mm{l ? ` ${l}` : ''}</button>
              ))}
            </div>
            <Field label="Dutch tilt"><Slider value={scene.camera.roll} min={-30} max={30} step={0.5} onChange={(v) => setCam({ roll: v })} format={(v) => `${v}°`} /></Field>
          </Section>
          <Section title="Depth of field">
            <Switch checked={scene.camera.dof.on} onChange={(v) => setCam({ dof: { ...scene.camera.dof, on: v } })} label="Blur the background" />
            {scene.camera.dof.on && (
              <>
                <Field label="Focus distance" aside={<button type="button" className="link" onClick={() => setCam({ dof: { ...scene.camera.dof, focus: +dist(c.p, subjectCenter).toFixed(2) } })}>On the subject</button>}>
                  <Slider value={scene.camera.dof.focus} min={0.2} max={30} step={0.05} onChange={(v) => setCam({ dof: { ...scene.camera.dof, focus: v } })} format={(v) => `${v.toFixed(2)} m`} />
                </Field>
                <Field label="Sharp zone"><Slider value={scene.camera.dof.range} min={0.05} max={8} step={0.05} onChange={(v) => setCam({ dof: { ...scene.camera.dof, range: v } })} format={(v) => `±${v.toFixed(2)} m`} /></Field>
                <Field label="Blur strength"><Slider value={scene.camera.dof.strength} min={0} max={1} step={0.01} onChange={(v) => setCam({ dof: { ...scene.camera.dof, strength: v } })} /></Field>
              </>
            )}
          </Section>
          <Section title="Saved angles" aside={<Button size="s" variant="ghost" icon="Plus" onClick={addShot} kbd="B">Save view</Button>}>
            {scene.shots.length === 0 ? <p className="field-hint">Save the views you like and go back to them with one click, or shoot them all at once from Batch.</p> : (
              <div className="angle-list">
                {scene.shots.map((s) => (
                  <div key={s.id} className="angle group" onClick={() => fetchNui('studio:cam', { pos: s.pos, rot: s.rot, fov: s.fov, ease: 700 })}>
                    <Icon name="Camera" size={14} />
                    <input value={s.name} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setScene((x) => ({ ...x, shots: x.shots.map((y) => (y.id === s.id ? { ...y, name: e.target.value } : y)) }))} />
                    <span className="num angle-fov">{s.fov.toFixed(0)}°</span>
                    <IconBtn size="s" icon="Trash" tone="bad" title="Delete" onClick={(e) => { e.stopPropagation(); setScene((x) => ({ ...x, shots: x.shots.filter((y) => y.id !== s.id) })) }} />
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </>
    )
  } else if (it) {
    const patch = (p: Partial<Item>) => patchItem(it.id, p)
    const actions = (
      <Menu trigger={(open) => <IconBtn icon="DotsThree" onClick={open} />} items={[
        { label: 'Duplicate', icon: 'Copy', onClick: () => { const c = { ...JSON.parse(JSON.stringify(it)), id: uid('it'), name: `${it.name} copy`, pos: add(it.pos, { x: 0.5, y: 0, z: 0 }) }; if (c.subject) c.subject = false; setScene((s) => ({ ...s, items: [...s.items, c] })); setSel(c.id) } },
        ...(it.kind === 'light' ? [{ label: 'Place at camera, facing the subject', icon: 'VideoCamera' as IconName, onClick: () => { const cc = camStore.get(); patch({ pos: cc.p, rot: lookAt(cc.p, subjectCenter) }); fetchNui('studio:item', { id: it.id, pos: cc.p, rot: lookAt(cc.p, subjectCenter) }) } }] : []),
        'sep',
        { label: 'Delete', icon: 'Trash', tone: 'bad', onClick: () => removeItem(it.id) },
      ]} />
    )
    const nameRow = <Field label="Name"><Input value={it.name} onChange={(v) => patch({ name: v })} /></Field>
    if (it.kind === 'prop') {
      const p = it as PropItem
      const d = dims[p.model]
      body = (
        <>
          {head('Cube', it.name, actions)}
          <div className="insp-scroll">
            <Section title="Prop">
              {nameRow}
              <Field label="Model" hint={d ? `${(d.max.x - d.min.x).toFixed(2)} × ${(d.max.y - d.min.y).toFixed(2)} × ${(d.max.z - d.min.z).toFixed(2)} m` : 'Loading size…'}>
                <Combo value={p.model} onChange={(v) => patch({ model: v } as any)} options={Object.values(models).map((m) => ({ value: m.model, label: m.label }))} mono />
              </Field>
              <Switch checked={!!p.subject} onChange={(v) => setScene((s) => ({ ...s, items: s.items.map((i) => (i.kind === 'prop' ? { ...i, subject: i.id === it.id ? v : v ? false : (i as PropItem).subject } as Item : i)) }))}
                label="Subject" hint="Lights aim at it, turntables spin it, shots are filed under its model" />
              <Field label="Opacity"><Slider value={p.alpha ?? 255} min={0} max={255} step={1} onChange={(v) => patch({ alpha: v >= 255 ? undefined : v } as any)} format={(v) => `${Math.round(v / 2.55)}%`} /></Field>
            </Section>
            <Transform it={it} patch={patch} onGround={ground} onFocus={focusSel} />
          </div>
        </>
      )
    } else if (it.kind === 'ped') {
      const p = it as PedItem
      const kind = p.scenario ? 'scenario' : p.anim?.dict ? 'anim' : 'none'
      body = (
        <>
          {head('PersonSimple', it.name, actions)}
          <div className="insp-scroll">
            <Section title="Person">
              {nameRow}
              <Switch checked={!!p.clone} onChange={(v) => patch({ clone: v } as any)} label="A copy of my character" hint="Your clothes and face, posed in the scene" />
              {!p.clone && <Field label="Model"><Combo value={p.model ?? ''} onChange={(v) => patch({ model: v } as any)} options={(cat?.peds ?? []).map((x) => ({ value: x.model, label: x.label }))} mono /></Field>}
              <Field label="Action">
                <Segmented full size="s" value={kind} onChange={(k) => patch(k === 'none' ? { anim: undefined, scenario: undefined } as any : k === 'scenario' ? { scenario: cat?.scenarios[0], anim: undefined } as any : { scenario: undefined, anim: { dict: cat?.anims[0].dict, clip: cat?.anims[0].clip, flag: 1 } } as any)}
                  options={[{ value: 'none', label: 'Stand' }, { value: 'anim', label: 'Animation' }, { value: 'scenario', label: 'Scenario' }]} />
              </Field>
              {kind === 'anim' && (
                <>
                  <Field label="Preset"><Select value="" placeholder="Choose" options={(cat?.anims ?? []).map((a, n) => ({ value: String(n), label: a.label }))} onChange={(n) => { const a = cat!.anims[+n]; patch({ anim: { dict: a.dict, clip: a.clip, flag: 1 } } as any) }} /></Field>
                  <div className="grid-2">
                    <Field label="Dictionary"><Input value={p.anim?.dict ?? ''} onChange={(v) => patch({ anim: { ...p.anim, dict: v } } as any)} mono /></Field>
                    <Field label="Clip"><Input value={p.anim?.clip ?? ''} onChange={(v) => patch({ anim: { ...p.anim, clip: v } } as any)} mono /></Field>
                  </div>
                </>
              )}
              {kind === 'scenario' && <Field label="Scenario"><Combo value={p.scenario ?? ''} onChange={(v) => patch({ scenario: v } as any)} options={(cat?.scenarios ?? []).map((s) => ({ value: s }))} mono /></Field>}
            </Section>
            <Transform it={it} patch={patch} onFocus={focusSel} />
          </div>
        </>
      )
    } else if (it.kind === 'light') {
      const l = it as LightItem
      const setL = (p: Partial<LightItem>) => patch({ ...p, color: lightColor(p.kelvin ?? l.kelvin, 'tint' in p ? p.tint : l.tint) } as any)
      body = (
        <>
          {head('Lightbulb', it.name, actions)}
          <div className="insp-scroll">
            <Section title="Light">
              {nameRow}
              <Segmented full size="s" value={l.type} onChange={(v) => setL({ type: v })} options={[{ value: 'spot', label: 'Spot', icon: 'Flashlight' }, { value: 'point', label: 'Bulb', icon: 'Lightbulb' }]} />
              <Field label="Colour temperature" aside={<span className="num field-aside">{l.kelvin} K</span>}>
                <span className="kelvin-track"><Slider value={l.kelvin} min={1800} max={10000} step={100} onChange={(v) => setL({ kelvin: v })} format={() => ''} /></span>
              </Field>
              <Field label="Gel" aside={l.tint && <button type="button" className="link" onClick={() => setL({ tint: undefined })}>Use temperature</button>}>
                <ColorField value={l.tint ?? hex(kelvin(l.kelvin))} onChange={(v) => setL({ tint: v })} swatches={['#ff8a3d', '#ff3d6e', '#7a5cff', '#3db8ff', '#3dffb5', '#ffe14d', '#ffffff']} />
              </Field>
              <Field label="Brightness"><Slider value={l.intensity} min={0} max={30} step={0.1} onChange={(v) => setL({ intensity: v })} /></Field>
              <Field label="Reach"><Slider value={l.range} min={1} max={40} step={0.5} onChange={(v) => setL({ range: v })} format={(v) => `${v} m`} /></Field>
              {l.type === 'spot' && (
                <>
                  <Field label="Beam angle"><Slider value={l.angle} min={5} max={90} step={1} onChange={(v) => setL({ angle: v })} format={(v) => `${v}°`} /></Field>
                  <Field label="Edge softness"><Slider value={l.softness} min={0} max={1} step={0.01} onChange={(v) => setL({ softness: v })} /></Field>
                  <Field label="Edge falloff" hint="How gradually the beam dims toward its edge"><Slider value={l.falloff ?? 6} min={0.5} max={20} step={0.5} onChange={(v) => setL({ falloff: v })} format={(v) => v.toFixed(1)} /></Field>
                  <Switch checked={l.aim} onChange={(v) => setL({ aim: v })} label="Always aim at the subject" hint="Off points it along its own rotation" />
                </>
              )}
              <Switch checked={l.shadow} onChange={(v) => setL({ shadow: v })} label="Casts shadows" hint="The game allows only a few shadowed lights at once" />
            </Section>
            <Transform it={it} patch={patch} onFocus={focusSel} />
          </div>
        </>
      )
    } else if (it.kind === 'fx') {
      const f = it as FxItem
      body = (
        <>
          {head('Sparkle', it.name, actions)}
          <div className="insp-scroll">
            <Section title="Effect">
              {nameRow}
              <Field label="Preset"><Select value="" placeholder="Choose an effect" options={(cat?.ptfx ?? []).map((x, n) => ({ value: String(n), label: x.label }))} onChange={(n) => { const x = cat!.ptfx[+n]; patch({ asset: x.asset, effect: x.name, scale: x.scale } as any) }} /></Field>
              <div className="grid-2">
                <Field label="Asset"><Input value={f.asset} onChange={(v) => patch({ asset: v } as any)} mono /></Field>
                <Field label="Effect"><Input value={f.effect} onChange={(v) => patch({ effect: v } as any)} mono /></Field>
              </div>
              <Field label="Scale"><Slider value={f.scale} min={0.05} max={5} step={0.05} onChange={(v) => patch({ scale: v } as any)} format={(v) => `${v.toFixed(2)}×`} /></Field>
              <Field label="Tint" aside={f.color && <button type="button" className="link" onClick={() => patch({ color: undefined } as any)}>None</button>}><ColorField value={f.color ?? '#ffffff'} onChange={(v) => patch({ color: v } as any)} /></Field>
            </Section>
            <Transform it={it} patch={patch} onFocus={focusSel} />
          </div>
        </>
      )
    } else if (it.kind === 'board') {
      const b = it as BoardItem
      const setB = (p: Partial<BoardItem['board']>) => patch({ board: { ...b.board, ...p } } as any)
      body = (
        <>
          {head('Monitor', it.name, actions)}
          <div className="insp-scroll">
            <Section title="Wall">
              <Field label="Title"><Input value={b.board.title} onChange={(v) => setB({ title: v })} /></Field>
              <Field label="Line under it"><Input value={b.board.sub} onChange={(v) => setB({ sub: v })} /></Field>
              <div className="grid-2">
                <Field label="Align"><Segmented full size="s" value={b.board.align} onChange={(v) => setB({ align: v })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }]} /></Field>
                <Switch checked={b.board.logo} onChange={(v) => setB({ logo: v })} label="Mark" />
              </div>
              <Field label="Accent"><ColorField value={b.board.accent} onChange={(v) => setB({ accent: v })} /></Field>
              <div className="grid-2">
                <Field label="Background"><ColorField value={b.board.bg} onChange={(v) => setB({ bg: v })} swatches={['#121216', '#ebe7e0', '#0c1118', '#1a0f0a', '#000000']} /></Field>
                <Field label="Glow"><ColorField value={b.board.bg2} onChange={(v) => setB({ bg2: v })} swatches={['#26262e', '#ffffff', '#1d2a3a', '#3a2216', '#ff8a3d']} /></Field>
              </div>
              <Field label="Background image link" hint="Any image URL the game can reach (a CDN link)"><Input value={b.board.image ?? ''} onChange={(v) => setB({ image: v || undefined })} mono placeholder="https://" /></Field>
              <div className="grid-2">
                <Field label="Width"><NumberField value={b.size.w} onChange={(v) => patch({ size: { w: v, h: +(v * 9 / 16).toFixed(3) } } as any)} step={0.1} min={0.5} max={40} unit="m" /></Field>
                <Field label="Height"><NumberField value={b.size.h} onChange={(v) => patch({ size: { ...b.size, h: v } } as any)} step={0.1} min={0.3} max={30} unit="m" /></Field>
              </div>
            </Section>
            <Transform it={it} patch={patch} onFocus={focusSel} />
          </div>
        </>
      )
    }
  } else if (ov) {
    const del = <IconBtn icon="Trash" tone="bad" title="Delete" onClick={() => removeItem(ov.id)} />
    if (ov.kind === 'text') {
      body = (
        <>
          {head('TextT', 'Text', del)}
          <div className="insp-scroll">
            <Section title="Text">
              <TextArea value={ov.text} onChange={(v) => setOv({ text: v })} rows={2} />
              <Field label="Size"><Slider value={ov.size} min={0.015} max={0.2} step={0.001} onChange={(v) => setOv({ size: v })} format={(v) => `${(v * 100).toFixed(1)}%`} /></Field>
              <Field label="Weight"><Segmented full size="s" value={String(ov.weight)} onChange={(v) => setOv({ weight: +v })} options={[{ value: '500', label: 'Regular' }, { value: '700', label: 'Bold' }, { value: '800', label: 'Heavy' }]} /></Field>
              <Field label="Align"><Segmented full size="s" value={ov.align} onChange={(v) => setOv({ align: v })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} /></Field>
              <Field label="Colour"><ColorField value={ov.color} onChange={(v) => setOv({ color: v })} /></Field>
              <div className="switch-list">
                <Switch checked={!!ov.upper} onChange={(v) => setOv({ upper: v })} label="Capitals" />
                <Switch checked={!!ov.plate} onChange={(v) => setOv({ plate: v })} label="Dark plate behind" />
                <Switch checked={!!ov.mono} onChange={(v) => setOv({ mono: v })} label="Numeric font" />
              </div>
              <Field label="Letter spacing"><Slider value={ov.tracking ?? 0} min={0} max={0.4} step={0.01} onChange={(v) => setOv({ tracking: v })} /></Field>
              <p className="field-hint">Drag it in the frame to move it.</p>
            </Section>
          </div>
        </>
      )
    } else if (ov.kind === 'logo') {
      body = (
        <>
          {head('Diamond', 'Logo', del)}
          <div className="insp-scroll">
            <Section title="Logo">
              <Segmented full size="s" value={ov.src === 'osmfx' ? 'osmfx' : 'url'} onChange={(v) => setOv({ src: v === 'osmfx' ? 'osmfx' : 'https://' })} options={[{ value: 'osmfx', label: 'OsmFX' }, { value: 'url', label: 'From a link' }]} />
              {ov.src !== 'osmfx' && <Field label="Image link" hint="PNG with transparency works best. The host must allow cross-origin loading"><Input value={ov.src} onChange={(v) => setOv({ src: v })} mono /></Field>}
              <Field label="Size"><Slider value={ov.size} min={0.02} max={0.4} step={0.001} onChange={(v) => setOv({ size: v })} format={(v) => `${(v * 100).toFixed(1)}%`} /></Field>
              <Field label="Opacity"><Slider value={ov.opacity} min={0.05} max={1} step={0.01} onChange={(v) => setOv({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} /></Field>
            </Section>
          </div>
        </>
      )
    } else if (ov.kind === 'callout') {
      body = (
        <>
          {head('ChatText', 'Interaction callout', del)}
          <div className="insp-scroll">
            <Section title="Callout">
              <Field label="Label"><Input value={ov.label} onChange={(v) => setOv({ label: v })} /></Field>
              <Field label="Second line"><Input value={ov.sub ?? ''} onChange={(v) => setOv({ sub: v || undefined })} /></Field>
              <div className="grid-2">
                <Field label="Key"><Input value={ov.key ?? ''} onChange={(v) => setOv({ key: v.slice(0, 3) || undefined })} mono /></Field>
                <Field label="Side"><Segmented full size="s" value={ov.side} onChange={(v) => setOv({ side: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'left', label: 'L' }, { value: 'right', label: 'R' }]} /></Field>
              </div>
              <Button variant="ghost" icon="CursorClick" onClick={() => setPicking(ov.id)}>Pick the spot it points at</Button>
              <p className="field-hint">It follows the spot in 3D, so it stays on the prop when you move the camera. For osm-target prompts in the shot itself, aim at the prop in the world before opening the studio.</p>
            </Section>
          </div>
        </>
      )
    }
  } else {
    body = <div className="insp-empty"><Icon name="Cursor" size={22} weight="duotone" /><span>Select something in the list, or click it in the scene.</span></div>
  }

  return <aside className="inspector studio-insp ui-scale-right" data-start={start ? 1 : 0}>{body}</aside>
}
