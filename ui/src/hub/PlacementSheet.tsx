import { useEffect, useMemo, useState } from 'react'
import { useApp, replied, toast } from '../lib/store'
import { fetchNui, rpc } from '../lib/nui'
import { Icon } from '../lib/icons'
import { Badge, Button, Combo, Empty, Field, IconBtn, Input, Menu, Section, Segmented, Slider, Switch, confirm } from '../kit/ui'
import { clone, cx, fmtDist } from '../lib/format'
import { dist } from '../lib/math'
import type { Placement } from '../lib/types'
import { hub } from './state'
import { SaveBar, SheetHead, Tabs } from './ModelSheet'
import { InteractionsList } from './Interactions'

type Tri = 'inherit' | 'on' | 'off'
const tri = (v: boolean | undefined): Tri => (v === undefined || v === null ? 'inherit' : v ? 'on' : 'off')
const untri = (t: Tri) => (t === 'inherit' ? undefined : t === 'on')

function Vec({ label, v, unit, prec }: { label: string; v: { x: number; y: number; z: number }; unit: string; prec: number }) {
  return (
    <div className="vec-read">
      <span className="vec-read-label">{label}</span>
      {(['x', 'y', 'z'] as const).map((k) => (
        <span key={k} className={cx('vec-read-cell', `axis-${k}`)}><span className="vec-read-axis">{k.toUpperCase()}</span><span className="num">{v[k].toFixed(prec)}</span></span>
      ))}
      <span className="vec-read-unit">{unit}</span>
    </div>
  )
}

function copyText(t: string) {
  const ta = document.createElement('textarea')
  ta.value = t
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy'); toast('Copied.', 'success') } catch { toast('Copy failed.', 'error') }
  ta.remove()
}

function Overview({ p }: { p: Placement }) {
  const model = useApp((s) => s.models[p.model])
  const placements = useApp((s) => s.placements)
  const me = useApp((s) => s.me)
  const [d, setD] = useState<Placement>(() => clone(p))
  const [busy, setBusy] = useState(false)
  useEffect(() => setD(clone(p)), [p])
  const base = { ...clone(p) }
  const dirty = JSON.stringify(pick(d)) !== JSON.stringify(pick(base))
  const set = (x: Partial<Placement>) => setD((o) => ({ ...o, ...x }))
  const groups = useMemo(() => [...new Set(Object.values(placements).map((x) => x.group).filter(Boolean))].map((g) => ({ value: g! })), [placements])
  const spawn = model?.spawn

  const save = async () => {
    setBusy(true)
    const res = await rpc('placement:save', { placement: d })
    setBusy(false)
    replied(res, 'Placement saved.')
  }

  return (
    <>
      <div className="sheet-scroll">
        <Section title="Transform" aside={<>
          <IconBtn size="s" icon="Copy" title="Copy as vector4 (x, y, z, heading)" onClick={() => copyText(`vector4(${p.pos.x.toFixed(4)}, ${p.pos.y.toFixed(4)}, ${p.pos.z.toFixed(4)}, ${p.rot.z.toFixed(3)})`)} />
          <Button size="s" variant="ghost" icon="ArrowsOutCardinal" onClick={() => fetchNui('hub:edit', { id: p.id })}>Edit in world</Button>
        </>}>
          <Vec label="Position" v={p.pos} unit="m" prec={4} />
          <Vec label="Rotation" v={p.rot} unit="deg" prec={3} />
          <div className="facts">
            <span className="fact"><Icon name="Crosshair" size={13} /><span className="num">{fmtDist(dist(me, p.pos))}</span> from you</span>
            {p.anchor && <span className="fact"><Icon name="Anchor" size={13} />Anchored to <span className="num">{String(p.anchor.model)}</span></span>}
            {p.interior && <span className="fact"><Icon name="House" size={13} />Inside an interior</span>}
            {p.netId && <span className="fact"><Icon name="Broadcast" size={13} />Net id <span className="num">{p.netId}</span></span>}
          </div>
        </Section>
        <Section title="Details">
          <div className="grid-2">
            <Field label="Label"><Input value={d.label ?? ''} onChange={(v) => set({ label: v || undefined })} placeholder={model?.label ?? p.model} /></Field>
            <Field label="Group"><Combo value={d.group ?? ''} onChange={(v) => set({ group: v || undefined })} options={groups} placeholder="None" /></Field>
          </div>
          <Switch checked={d.enabled !== false} onChange={(v) => set({ enabled: v })} label="Enabled" hint="Off keeps the placement but nobody sees it" />
        </Section>
        <Section title="Overrides" sub="Inherit uses the model's profile.">
          <Field label="Mode">
            <Segmented full size="s" value={d.mode ?? 'inherit'} onChange={(v) => set({ mode: v === 'inherit' ? undefined : (v as any) })} options={[
              { value: 'inherit', label: `Inherit (${spawn?.mode === 'networked' ? 'networked' : 'local'})` },
              { value: 'local', label: 'Local' }, { value: 'networked', label: 'Networked' },
            ]} />
          </Field>
          <Field label="Spawn distance" aside={<Switch checked={d.distance === undefined} onChange={(v) => set({ distance: v ? undefined : spawn?.distance ?? 120 })} label="Inherit" />}>
            {d.distance !== undefined
              ? <Slider value={d.distance} min={10} max={1500} step={5} onChange={(v) => set({ distance: v })} format={(v) => `${v} m`} />
              : <span className="inherit-note num">{spawn?.distance ?? 120} m from the model</span>}
          </Field>
          <Field label="Detail distance (LOD)" aside={<Switch checked={d.lod === undefined} onChange={(v) => set({ lod: v ? undefined : spawn?.lod ?? 300 })} label="Inherit" />}>
            {d.lod !== undefined
              ? <Slider value={d.lod} min={20} max={3000} step={10} onChange={(v) => set({ lod: v })} format={(v) => `${v} m`} />
              : <span className="inherit-note num">{spawn?.lod ?? 300} m from the model</span>}
          </Field>
          <div className="grid-2">
            <Field label="Frozen"><Segmented full size="s" value={tri(d.freeze)} onChange={(v) => set({ freeze: untri(v) })} options={[{ value: 'inherit', label: 'Inherit' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} /></Field>
            <Field label="Collision"><Segmented full size="s" value={tri(d.collision)} onChange={(v) => set({ collision: untri(v) })} options={[{ value: 'inherit', label: 'Inherit' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} /></Field>
          </div>
          <Field label="Opacity">
            <Slider value={d.alpha ?? 255} min={0} max={255} step={1} onChange={(v) => set({ alpha: v >= 255 ? undefined : v })} format={(v) => `${Math.round((v / 255) * 100)}%`} />
          </Field>
        </Section>
        {(p.state || p.hidden || p.swap) && (
          <Section title="Live state" aside={<Button size="s" variant="quiet" icon="ArrowCounterClockwise" onClick={async () => replied(await rpc('placement:reset', { id: p.id }), 'State reset.')}>Reset</Button>}>
            <div className="state-pills">
              {p.hidden && <Badge tone="warn" icon="HandGrabbing">Picked up</Badge>}
              {p.swap && <Badge tone="info" icon="Swap">Showing {p.swap}</Badge>}
              {Object.entries(p.state ?? {}).map(([k, v]) => <Badge key={k} tone="plain"><span className="num">{k} = {JSON.stringify(v)}</span></Badge>)}
            </div>
          </Section>
        )}
      </div>
      <SaveBar dirty={dirty} busy={busy} onSave={save} onRevert={() => setD(clone(p))} note={p.pack ? `From pack ${p.pack}${p.modified ? ', edited here' : ''}` : undefined} />
    </>
  )
}

// Extracts editable fields to prevent live state updates from marking dirty.
function pick(p: Placement) {
  return { label: p.label, group: p.group, enabled: p.enabled, mode: p.mode, distance: p.distance, lod: p.lod, freeze: p.freeze, collision: p.collision, alpha: p.alpha }
}

export function PlacementSheet({ id, tab = 'overview' }: { id: string; tab?: 'overview' | 'interactions' }) {
  const p = useApp((s) => s.placements[id])
  const model = useApp((s) => (p ? s.models[p.model] : undefined))
  if (!p) return <Empty icon="MapPin" title="Placement not found" body="It may have been deleted." />
  const total = (p.interactions?.length ?? 0) + (p.inherit !== false ? model?.interactions.length ?? 0 : 0)

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this placement?', body: 'It is removed for everyone.', confirm: 'Delete', tone: 'bad', icon: 'Trash' }))) return
    if (replied(await rpc('placement:delete', { id }), 'Placement deleted.')) hub.set({ sheet: null })
  }
  const duplicate = async () => {
    const c = clone(p) as any
    delete c.id; delete c.pack; delete c.key; delete c.modified; delete c.state; delete c.hidden; delete c.swap; delete c.netId
    c.pos = { ...c.pos, x: c.pos.x + 1 }
    const res = await rpc('placement:save', { placement: c })
    if (replied(res, 'Copy placed one metre over. Move it into place.') && res.placement) fetchNui('hub:edit', { id: res.placement.id })
  }

  return (
    <div className="sheet-inner">
      <SheetHead title={p.label || model?.label || p.model} sub={<span className="num">{p.id}</span>} onClose={() => hub.set({ sheet: null })}
        actions={<Menu trigger={(open) => <IconBtn icon="DotsThree" title="More" onClick={open} />} items={[
          { label: 'Go there', icon: 'MapPin', onClick: () => fetchNui('hub:goto', { id }) },
          { label: 'Duplicate', icon: 'Copy', onClick: duplicate },
          { label: 'Open model', icon: 'Cube', onClick: () => hub.set({ sheet: { kind: 'model', model: p.model, tab: 'profile' } }) },
          'sep',
          { label: 'Delete', icon: 'Trash', tone: 'bad', onClick: remove },
        ]} />} />
      <div className="sheet-actions">
        <Button variant="primary" icon="ArrowsOutCardinal" onClick={() => fetchNui('hub:edit', { id })}>Edit in world</Button>
        <Button variant="ghost" icon="MapPin" onClick={() => fetchNui('hub:goto', { id })}>Go there</Button>
      </div>
      <Tabs value={tab} onChange={(t) => hub.set({ sheet: { kind: 'placement', id, tab: t } })} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'interactions', label: 'Interactions', count: total }]} />
      {tab === 'overview' && <Overview p={p} />}
      {tab === 'interactions' && <div className="sheet-scroll"><InteractionsList owner={{ kind: 'placement', id }} /></div>}
    </div>
  )
}
