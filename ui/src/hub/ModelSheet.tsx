import { useEffect, useMemo, useState } from 'react'
import { useApp, replied } from '../lib/store'
import { fetchNui, rpc } from '../lib/nui'
import { Badge, Button, Combo, Empty, Field, IconBtn, Input, Menu, Section, Segmented, Slider, Switch, TextArea, confirm, copyText } from '../kit/ui'
import { clone, cx } from '../lib/format'
import type { Model } from '../lib/types'
import { hub } from './state'
import { Thumb, refreshModel } from './Library'
import { InteractionsList } from './Interactions'
import { PlacementRow } from './Placed'

export function SheetHead({ title, sub, onClose, actions, back }: { title: React.ReactNode; sub?: React.ReactNode; onClose?: () => void; actions?: React.ReactNode; back?: () => void }) {
  return (
    <header className="sheet-head">
      {back && <IconBtn icon="ArrowLeft" title="Back" onClick={back} />}
      <span className="sheet-title-wrap">
        <span className="sheet-title">{title}</span>
        {sub && <span className="sheet-sub">{sub}</span>}
      </span>
      {actions}
      {onClose && <IconBtn icon="X" title="Close" onClick={onClose} />}
    </header>
  )
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { id: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <button key={t.id} type="button" className={cx('tab', value === t.id && 'is-on')} onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined && <span className="tab-count num">{t.count}</span>}
        </button>
      ))}
    </nav>
  )
}

export function SaveBar({ dirty, busy, onSave, onRevert, note }: { dirty: boolean; busy?: boolean; onSave: () => void; onRevert: () => void; note?: React.ReactNode }) {
  return (
    <footer className={cx('save-bar', dirty && 'is-dirty')}>
      <span className="save-bar-note">{dirty ? 'Unsaved changes' : note ?? 'All changes saved'}</span>
      <Button variant="quiet" size="s" onClick={onRevert} disabled={!dirty}>Revert</Button>
      <Button variant="primary" size="s" icon="FloppyDisk" onClick={onSave} disabled={!dirty} busy={busy}>Save</Button>
    </footer>
  )
}

function ProfileTab({ model }: { model: Model }) {
  const models = useApp((s) => s.models)
  const boot = useApp((s) => s.boot)
  const [d, setD] = useState<Model>(() => clone(model))
  const [busy, setBusy] = useState(false)
  useEffect(() => setD(clone(model)), [model])
  const dirty = JSON.stringify(d) !== JSON.stringify(model)
  const cats = useMemo(() => [...new Set(Object.values(models).map((m) => m.category))].map((c) => ({ value: c })), [models])
  const set = (p: Partial<Model>) => setD((x) => ({ ...x, ...p }))
  const spawn = (p: Partial<Model['spawn']>) => setD((x) => ({ ...x, spawn: { ...x.spawn, ...p } }))

  const save = async () => {
    setBusy(true)
    const res = await rpc('model:save', { model: d })
    setBusy(false)
    if (replied(res, 'Profile saved.') && res.model) refreshModel(res.model)
  }

  return (
    <>
      <div className="sheet-scroll">
        <Section title="Identity">
          <div className="grid-2">
            <Field label="Label"><Input value={d.label} onChange={(v) => set({ label: v })} maxLength={80} /></Field>
            <Field label="Category"><Combo value={d.category} onChange={(v) => set({ category: v })} options={cats} /></Field>
          </div>
          <Field label="Description" hint="Shown in the library and exported with the pack.">
            <TextArea value={d.description ?? ''} onChange={(v) => set({ description: v })} rows={2} placeholder="What this prop is for" />
          </Field>
        </Section>
        <Section title="Spawning" sub="Defaults for every placement of this model. A placement can override each one.">
          <Field label="Mode">
            <Segmented full value={d.spawn.mode} onChange={(v) => spawn({ mode: v })} options={[
              { value: 'local', label: 'Local', icon: 'Cube', hint: 'Every player spawns their own copy. Best for static props' },
              { value: 'networked', label: 'Networked', icon: 'Broadcast', hint: 'One shared server entity. Use for props that move or must be the same object for everyone' },
            ]} />
          </Field>
          <p className="field-hint">{d.spawn.mode === 'local'
            ? 'Spawned by each player within the distance below. No entity limits and no ownership issues.'
            : 'Created once by the server (OneSync) and streamed by the game. Counts toward the entity pool.'}</p>
          <Field label="Spawn distance">
            <Slider value={d.spawn.distance} min={10} max={600} step={5} onChange={(v) => spawn({ distance: v })} format={(v) => `${v} m`} />
          </Field>
          <Field label="Detail distance (LOD)" hint="How far the full model draws before the game lowers its detail.">
            <Slider value={d.spawn.lod} min={20} max={1500} step={10} onChange={(v) => spawn({ lod: v })} format={(v) => `${v} m`} />
          </Field>
          <div className="switch-list">
            <Switch checked={d.spawn.freeze} onChange={(v) => spawn({ freeze: v })} label="Frozen" hint="Stays exactly where placed, no physics" />
            <Switch checked={d.spawn.collision} onChange={(v) => spawn({ collision: v })} label="Collision" hint="Players and vehicles bump into it" />
            <Switch checked={d.spawn.invincible} onChange={(v) => spawn({ invincible: v })} label="Unbreakable" hint="Ignores damage and explosions" />
          </div>
        </Section>
        <Section title="Map copies">
          <Switch checked={!!d.worldTargets} onChange={(v) => set({ worldTargets: v })} label="Add interactions to copies the map places"
            hint={`Every ${d.model} already in the world gets this model's interactions too.${boot?.target === 'qb' ? ' qb-target ignores per-point offsets here.' : ''}`} />
        </Section>
      </div>
      <SaveBar dirty={dirty} busy={busy} onSave={save} onRevert={() => setD(clone(model))} note={model.pack ? `From pack ${model.pack}${model.modified ? ', edited here' : ''}` : undefined} />
    </>
  )
}

export function ModelSheet({ model: name, tab = 'profile' }: { model: string; tab?: 'profile' | 'interactions' | 'placed' }) {
  const model = useApp((s) => s.models[name])
  const placements = useApp((s) => s.placements)
  const perms = useApp((s) => s.perms)
  const mine = useMemo(() => Object.values(placements).filter((p) => p.model === name), [placements, name])
  const setTab = (t: typeof tab) => hub.set({ sheet: { kind: 'model', model: name, tab: t } })

  if (!model) return <Empty icon="Cube" title="Model not found" body="It may have been removed." />

  const remove = async () => {
    const ok = await confirm({ title: `Remove ${model.label}?`, body: mine.length ? `${mine.length} placement(s) use this model. They stay in place and fall back to default settings.` : 'Its settings and interactions are deleted.', confirm: 'Remove', tone: 'bad', icon: 'Trash' })
    if (!ok) return
    const res = await rpc('model:delete', { model: name, force: true })
    if (replied(res, 'Model removed.')) hub.set({ sheet: null })
  }

  return (
    <div className="sheet-inner">
      <SheetHead title={model.label} sub={<span className="num">{model.model}</span>} onClose={() => hub.set({ sheet: null })}
        actions={<Menu trigger={(open) => <IconBtn icon="DotsThree" title="More" onClick={open} />} items={[
          { label: 'Export as pack', icon: 'Export', onClick: () => hub.set({ sheet: { kind: 'export', models: [name] } }) },
          { label: 'Copy model name', icon: 'Copy', onClick: () => copyText(name, 'Model name copied.') },
          'sep',
          { label: 'Remove model', icon: 'Trash', tone: 'bad', onClick: remove },
        ]} />} />
      <div className="model-hero">
        <Thumb model={model} size="hero" onShoot={perms.studio ? () => fetchNui('hub:studio', { model: name }) : undefined} />
        <div className="model-hero-actions">
          <Button variant="primary" icon="Plus" onClick={() => fetchNui('hub:place', { model: name })} >Place</Button>
          {perms.studio && <Button variant="ghost" icon="Aperture" onClick={() => fetchNui('hub:studio', { model: name })}>Shoot</Button>}
          <span className="model-hero-badges">
            <Badge tone={model.spawn.mode === 'networked' ? 'info' : 'plain'} icon={model.spawn.mode === 'networked' ? 'Broadcast' : 'Cube'}>{model.spawn.mode === 'networked' ? 'Networked' : 'Local'}</Badge>
            {model.pack && <Badge tone={model.modified ? 'warn' : 'plain'} icon="Stack">{model.pack}</Badge>}
          </span>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'profile', label: 'Profile' },
        { id: 'interactions', label: 'Interactions', count: model.interactions.length },
        { id: 'placed', label: 'Placed', count: mine.length },
      ]} />
      {tab === 'profile' && <ProfileTab model={model} />}
      {tab === 'interactions' && <div className="sheet-scroll"><InteractionsList owner={{ kind: 'model', model: name }} /></div>}
      {tab === 'placed' && (
        <div className="sheet-scroll">
          {mine.length === 0
            ? <Empty icon="MapPin" title="Not placed yet" body="Place it from here and it shows up in this list." action={<Button variant="primary" icon="Plus" onClick={() => fetchNui('hub:place', { model: name })}>Place one</Button>} />
            : <div className="rows">{mine.map((p) => <PlacementRow key={p.id} p={p} />)}</div>}
        </div>
      )}
    </div>
  )
}
