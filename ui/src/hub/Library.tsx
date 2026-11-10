import { useMemo, useState } from 'react'
import { app, replied, useApp, useThumb } from '../lib/store'
import { fetchNui, rpc } from '../lib/nui'
import { Icon } from '../lib/icons'
import { Button, Chip, Empty, Input } from '../kit/ui'
import { cx } from '../lib/format'
import type { Model } from '../lib/types'
import { hub, useHub } from './state'

// Prop model preview thumbnail.
export function Thumb({ model, size = 'card', onShoot }: { model?: Model; size?: 'card' | 'hero' | 'row'; onShoot?: () => void }) {
  const src = useThumb(model?.thumb)
  if (src) return <span className={cx('thumb', `thumb--${size}`)}><img src={src} alt="" draggable={false} /></span>
  return (
    <span className={cx('thumb', `thumb--${size}`, 'is-empty')}>
      <Icon name="Cube" size={size === 'row' ? 16 : size === 'hero' ? 34 : 24} weight="duotone" />
      {size !== 'row' && <span className="thumb-note">No photo yet</span>}
      {size === 'hero' && onShoot && <button type="button" className="thumb-cta" onClick={onShoot}><Icon name="Aperture" size={14} /> Shoot one in the studio</button>}
    </span>
  )
}

function NewModel({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState(false)
  const create = async () => {
    const model = name.trim()
    if (!model) return
    setBusy(true)
    const info = await fetchNui('hub:modelInfo', { model })
    if (!info?.ok) { setBusy(false); setBad(true); return }
    const res = await rpc('model:save', { model: { model, label: model, interactions: [] } })
    setBusy(false)
    if (replied(res, 'Model added.')) {
      onDone()
      hub.set({ sheet: { kind: 'model', model, tab: 'profile' } })
    }
  }
  return (
    <div className="new-model">
      <Input value={name} onChange={(v) => { setName(v); setBad(false) }} placeholder="Model name, e.g. prop_toolchest_05" mono autoFocus onEnter={create} icon="Cube" invalid={bad} />
      <Button variant="primary" size="m" onClick={create} busy={busy} disabled={!name.trim()}>Add</Button>
      <Button variant="quiet" size="m" onClick={onDone}>Cancel</Button>
      {bad && <span className="field-hint tone-bad new-model-err">That model is not in the game files or any streamed resource.</span>}
    </div>
  )
}

export function Library() {
  const models = useApp((s) => s.models)
  const placements = useApp((s) => s.placements)
  const sheet = useHub((v) => v.sheet)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('all')
  const [adding, setAdding] = useState(false)

  const placedBy = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of Object.values(placements)) m[p.model] = (m[p.model] ?? 0) + 1
    return m
  }, [placements])

  const cats = useMemo(() => {
    const m: Record<string, number> = {}
    for (const x of Object.values(models)) m[x.category] = (m[x.category] ?? 0) + 1
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [models])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return Object.values(models)
      .filter((m) => cat === 'all' || m.category === cat)
      .filter((m) => !s || m.label.toLowerCase().includes(s) || m.model.toLowerCase().includes(s) || (m.pack ?? '').includes(s))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [models, q, cat])

  const selected = sheet?.kind === 'model' ? sheet.model : null

  return (
    <div className="pane">
      <div className="pane-tools">
        <Input value={q} onChange={setQ} placeholder="Search models" icon="MagnifyingGlass" />
        <Button icon="Plus" variant="ghost" onClick={() => setAdding(true)} title="Add a model by name">Model</Button>
      </div>
      {adding && <NewModel onDone={() => setAdding(false)} />}
      {cats.length > 1 && (
        <div className="chips">
          <Chip active={cat === 'all'} onClick={() => setCat('all')} count={Object.keys(models).length}>All</Chip>
          {cats.map(([c, n]) => <Chip key={c} active={cat === c} onClick={() => setCat(c)} count={n}>{c}</Chip>)}
        </div>
      )}
      <div className="pane-scroll">
        {list.length === 0 ? (
          Object.keys(models).length === 0
            ? <Empty icon="Package" title="No models yet" body="Install a pack from the Packs tab, or add any prop by its model name." action={<Button icon="Plus" variant="primary" onClick={() => setAdding(true)}>Add a model</Button>} />
            : <Empty icon="MagnifyingGlass" title="Nothing matches" body="Try a model name or a different category." />
        ) : (
          <div className="model-grid">
            {list.map((m) => (
              <button key={m.model} type="button" className={cx('model-card', selected === m.model && 'is-on')}
                onClick={() => hub.set({ sheet: { kind: 'model', model: m.model, tab: 'profile' }, draft: null })}>
                <Thumb model={m} />
                <span className="model-card-body">
                  <span className="model-card-title">{m.label}</span>
                  <span className="model-card-model num">{m.model}</span>
                </span>
                <span className="model-card-foot">
                  <span className="meta"><Icon name="MapPin" size={12} /><span className="num">{placedBy[m.model] ?? 0}</span></span>
                  <span className="meta"><Icon name="Hand" size={12} /><span className="num">{m.interactions?.length ?? 0}</span></span>
                  {m.pack && <span className={cx('meta meta--pack', m.modified && 'is-edited')} title={m.modified ? `From ${m.pack}, edited here` : `From ${m.pack}`}><Icon name="Stack" size={12} />{m.modified ? 'edited' : ''}</span>}
                  <span className="model-card-place" title="Place one" onClick={(e) => { e.stopPropagation(); fetchNui('hub:place', { model: m.model }) }}>
                    <Icon name="Plus" size={14} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function refreshModel(m: Model) {
  app.set((s) => ({ models: { ...s.models, [m.model]: m } }))
}

