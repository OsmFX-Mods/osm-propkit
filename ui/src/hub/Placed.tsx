import { useMemo, useState } from 'react'
import { useApp, replied } from '../lib/store'
import { fetchNui, rpc } from '../lib/nui'
import { Icon } from '../lib/icons'
import { Button, Chip, Empty, IconBtn, Input, Menu, confirm } from '../kit/ui'
import { cx, fmtDist } from '../lib/format'
import { dist } from '../lib/math'
import type { Placement } from '../lib/types'
import { hub, useHub } from './state'
import { Thumb } from './Library'

type Filter = 'all' | 'near' | 'disabled' | 'pack' | 'edited'

export function PlacementRow({ p, selectable, selected, onSelect }: { p: Placement; selectable?: boolean; selected?: boolean; onSelect?: (v: boolean) => void }) {
  const model = useApp((s) => s.models[p.model])
  const me = useApp((s) => s.me)
  const sheet = useHub((v) => v.sheet)
  const on = sheet?.kind === 'placement' && sheet.id === p.id
  const d = dist(me, p.pos)
  const own = p.interactions?.length ?? 0
  const inherited = p.inherit !== false ? model?.interactions?.length ?? 0 : 0
  const mode = p.mode ?? model?.spawn.mode ?? 'local'

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this placement?', body: `${p.label || model?.label || p.model} is removed for everyone.`, confirm: 'Delete', tone: 'bad', icon: 'Trash' }))) return
    replied(await rpc('placement:delete', { id: p.id }), 'Placement deleted.')
  }

  return (
    <div className={cx('row group', on && 'is-on', p.enabled === false && 'is-off', selected && 'is-selected')}
      onMouseEnter={() => fetchNui('hub:highlight', { id: p.id })} onMouseLeave={() => fetchNui('hub:highlight', { id: null })}
      onClick={() => hub.set({ sheet: { kind: 'placement', id: p.id, tab: 'overview' }, draft: null })}>
      {selectable && (
        <span className={cx('check', selected && 'is-on')} onClick={(e) => { e.stopPropagation(); onSelect?.(!selected) }}>
          {selected && <Icon name="Check" size={11} weight="fill" />}
        </span>
      )}
      <Thumb model={model} size="row" />
      <span className="row-main">
        <span className="row-title">{p.label || model?.label || p.model}</span>
        <span className="row-meta">
          <span className="num">{p.model}</span>
          {p.group && <><span className="dot-sep" /><span>{p.group}</span></>}
        </span>
      </span>
      <span className="row-badges">
        {p.enabled === false && <span className="pill pill--muted">Off</span>}
        {p.hidden && <span className="pill pill--warn" title="Picked up, waiting to respawn">Taken</span>}
        {mode === 'networked' && <span className="pill pill--info" title="Networked"><Icon name="Broadcast" size={11} /></span>}
        {p.anchor && <span className="pill" title="Anchored to a map object"><Icon name="Anchor" size={11} /></span>}
        {own + inherited > 0 && <span className="pill" title={`${own} own, ${inherited} from the model`}><Icon name="Hand" size={11} /><span className="num">{own + inherited}</span></span>}
        {p.pack && <span className={cx('pill', p.modified && 'pill--warn')} title={p.modified ? `From ${p.pack}, moved or edited here` : `From ${p.pack}`}><Icon name="Stack" size={11} /></span>}
      </span>
      <span className="row-dist num">{fmtDist(d)}</span>
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        <IconBtn size="s" icon="ArrowsOutCardinal" title="Move in the world" onClick={() => fetchNui('hub:edit', { id: p.id })} />
        <Menu trigger={(open) => <IconBtn size="s" icon="DotsThree" title="More" onClick={open} />} items={[
          { label: 'Go there', icon: 'MapPin', onClick: () => fetchNui('hub:goto', { id: p.id }) },
          { label: p.enabled === false ? 'Enable' : 'Disable', icon: p.enabled === false ? 'Eye' : 'EyeSlash', onClick: async () => replied(await rpc('placement:toggle', { id: p.id, enabled: p.enabled === false })) },
          'sep',
          { label: 'Delete', icon: 'Trash', tone: 'bad', onClick: remove },
        ]} />
      </span>
    </div>
  )
}

export function Placed() {
  const placements = useApp((s) => s.placements)
  const models = useApp((s) => s.models)
  const me = useApp((s) => s.me)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [selecting, setSelecting] = useState(false)

  const all = Object.values(placements)
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all
      .filter((p) => {
        if (filter === 'near') return dist(me, p.pos) <= 100
        if (filter === 'disabled') return p.enabled === false || p.hidden
        if (filter === 'pack') return !!p.pack
        if (filter === 'edited') return !!p.modified
        return true
      })
      .filter((p) => !s || (p.label ?? '').toLowerCase().includes(s) || p.model.toLowerCase().includes(s) || (p.group ?? '').toLowerCase().includes(s) || (models[p.model]?.label ?? '').toLowerCase().includes(s) || p.id.includes(s))
      .sort((a, b) => dist(me, a.pos) - dist(me, b.pos))
  }, [placements, q, filter, me, models])

  // Groups placements by group identifier with ungrouped entries first.
  const groups = useMemo(() => {
    const m = new Map<string, Placement[]>()
    for (const p of list) {
      const g = p.group || ''
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(p)
    }
    return [...m.entries()].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0])))
  }, [list])

  const count = (f: Filter) => all.filter((p) => f === 'near' ? dist(me, p.pos) <= 100 : f === 'disabled' ? p.enabled === false || p.hidden : f === 'pack' ? !!p.pack : f === 'edited' ? !!p.modified : true).length

  const bulk = async (action: 'delete' | 'off' | 'on') => {
    const ids = [...sel]
    if (action === 'delete' && !(await confirm({ title: `Delete ${ids.length} placements?`, body: 'They are removed for everyone. This cannot be undone.', confirm: 'Delete all', tone: 'bad', icon: 'Trash' }))) return
    const res = action === 'delete' ? await rpc('placement:delete', { ids }) : await rpc('placement:toggle', { ids, enabled: action === 'on' })
    if (replied(res, 'Done.')) { setSel(new Set()); setSelecting(false) }
  }

  return (
    <div className="pane">
      <div className="pane-tools">
        <Input value={q} onChange={setQ} placeholder="Search label, model, group or id" icon="MagnifyingGlass" />
        <IconBtn icon="CheckSquare" title="Select several" active={selecting} onClick={() => { setSelecting((s) => !s); setSel(new Set()) }} />
      </div>
      <div className="chips">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={all.length}>All</Chip>
        <Chip active={filter === 'near'} onClick={() => setFilter('near')} count={count('near')} icon="Crosshair">Within 100 m</Chip>
        <Chip active={filter === 'pack'} onClick={() => setFilter('pack')} count={count('pack')}>From packs</Chip>
        <Chip active={filter === 'edited'} onClick={() => setFilter('edited')} count={count('edited')}>Edited</Chip>
        <Chip active={filter === 'disabled'} onClick={() => setFilter('disabled')} count={count('disabled')}>Off</Chip>
      </div>
      {selecting && (
        <div className="bulk-bar">
          <span className="num">{sel.size}</span><span>selected</span>
          <button type="button" className="link" onClick={() => setSel(new Set(list.map((p) => p.id)))}>Select all {list.length}</button>
          <span className="bulk-actions">
            <Button size="s" variant="quiet" icon="Eye" disabled={!sel.size} onClick={() => bulk('on')}>Enable</Button>
            <Button size="s" variant="quiet" icon="EyeSlash" disabled={!sel.size} onClick={() => bulk('off')}>Disable</Button>
            <Button size="s" variant="danger" icon="Trash" disabled={!sel.size} onClick={() => bulk('delete')}>Delete</Button>
          </span>
        </div>
      )}
      <div className="pane-scroll">
        {list.length === 0
          ? all.length === 0
            ? <Empty icon="MapPin" title="Nothing placed yet" body="Pick a model in the Library and press Place, or install a pack that ships locations." />
            : <Empty icon="Funnel" title="No placements match" body="Clear the search or pick another filter." />
          : groups.map(([g, ps]) => (
            <div key={g || '_'} className="group-block">
              {groups.length > 1 && <div className="group-head"><Icon name="Folder" size={13} /><span>{g || 'No group'}</span><span className="num group-count">{ps.length}</span></div>}
              <div className="rows">
                {ps.map((p) => <PlacementRow key={p.id} p={p} selectable={selecting} selected={sel.has(p.id)} onSelect={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(p.id); else n.delete(p.id); return n })} />)}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
