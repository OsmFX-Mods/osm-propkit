import { app, useApp, replied } from '../lib/store'
import { fetchNui, rpc } from '../lib/nui'
import { Icon, type IconName } from '../lib/icons'
import { Button, Empty, IconBtn, Menu, Switch, confirm } from '../kit/ui'
import { clone, cx, fmtMs } from '../lib/format'
import type { Interaction, Model, Placement, Step, StepType } from '../lib/types'
import { hub, type Owner } from './state'
import { refreshModel } from './Library'

// Font Awesome icon preview mapping.
export function faPreview(fa: string): IconName {
  const hit = app.get().boot?.catalog.icons.find((i) => i.fa === fa)
  return (hit?.preview as IconName) ?? 'Hand'
}

export const STEP_META: Record<StepType, { label: string; icon: IconName; group: 'Timing' | 'Rewards' | 'Costs' | 'Triggers' | 'Feedback' | 'Prop'; side: 'client' | 'server' | 'either' }> = {
  progress: { label: 'Progress bar', icon: 'Hourglass', group: 'Timing', side: 'client' },
  anim: { label: 'Animation', icon: 'PersonSimple', group: 'Timing', side: 'client' },
  wait: { label: 'Wait', icon: 'Timer', group: 'Timing', side: 'client' },
  giveItem: { label: 'Give item', icon: 'Gift', group: 'Rewards', side: 'server' },
  giveMoney: { label: 'Give money', icon: 'Coins', group: 'Rewards', side: 'server' },
  removeItem: { label: 'Take item', icon: 'Backpack', group: 'Costs', side: 'server' },
  removeMoney: { label: 'Take money', icon: 'Wallet', group: 'Costs', side: 'server' },
  clientEvent: { label: 'Client event', icon: 'Plug', group: 'Triggers', side: 'client' },
  serverEvent: { label: 'Server event', icon: 'Broadcast', group: 'Triggers', side: 'either' },
  export: { label: 'Export call', icon: 'Code', group: 'Triggers', side: 'either' },
  command: { label: 'Command', icon: 'Terminal', group: 'Triggers', side: 'client' },
  notify: { label: 'Notification', icon: 'Bell', group: 'Feedback', side: 'client' },
  sound: { label: 'Sound', icon: 'SpeakerHigh', group: 'Feedback', side: 'client' },
  ptfx: { label: 'Particle effect', icon: 'Sparkle', group: 'Feedback', side: 'client' },
  setState: { label: 'Set state', icon: 'Swap', group: 'Prop', side: 'server' },
  swapModel: { label: 'Swap model', icon: 'Cube', group: 'Prop', side: 'server' },
  pickup: { label: 'Pick up prop', icon: 'HandGrabbing', group: 'Prop', side: 'server' },
}

export function stepSummary(s: Step): string {
  switch (s.type) {
    case 'progress': return `${s.label || 'Progress'} · ${fmtMs(s.duration ?? 0)}`
    case 'anim': return s.anim?.scenario ?? `${s.anim?.clip ?? 'anim'}${s.duration ? ` · ${fmtMs(s.duration)}` : ''}`
    case 'wait': return fmtMs(s.duration ?? 0)
    case 'giveItem': return `${s.count ?? 1}× ${s.item}`
    case 'removeItem': return `${s.count ?? 1}× ${s.item}`
    case 'giveMoney': case 'removeMoney': return `$${(s.amount ?? 0).toLocaleString()} ${s.account}`
    case 'clientEvent': case 'serverEvent': return s.name ?? ''
    case 'export': return `${s.resource}:${s.fn} (${s.side})`
    case 'command': return `/${s.command}`
    case 'notify': return s.text ?? ''
    case 'sound': return s.name ?? ''
    case 'ptfx': return s.name ?? ''
    case 'setState': return s.toggle ? `toggle ${s.key}` : `${s.key} = ${JSON.stringify(s.value)}`
    case 'swapModel': return `↔ ${s.model}`
    case 'pickup': return s.respawn ? `back after ${s.respawn}s` : 'gone until restart'
  }
}

export function newStep(type: StepType): Step {
  switch (type) {
    case 'progress': return { type, duration: 3000, label: 'Working', canCancel: true, freeze: true }
    case 'anim': return { type, anim: { dict: 'mini@repair', clip: 'fixing_a_ped', flag: 1 }, duration: 2000 }
    case 'wait': return { type, duration: 1000 }
    case 'giveItem': return { type, item: 'water', count: 1 }
    case 'removeItem': return { type, item: 'water', count: 1 }
    case 'giveMoney': return { type, account: 'cash', amount: 100 }
    case 'removeMoney': return { type, account: 'cash', amount: 100 }
    case 'clientEvent': return { type, name: 'myresource:client:use' }
    case 'serverEvent': return { type, name: 'myresource:server:use', via: 'net' }
    case 'export': return { type, resource: 'myresource', fn: 'Use', side: 'client' }
    case 'command': return { type, command: 'e notepad' }
    case 'notify': return { type, text: 'Done.', kind: 'success' }
    case 'sound': return { type, name: 'PICK_UP', set: 'HUD_FRONTEND_DEFAULT_SOUNDSET' }
    case 'ptfx': return { type, asset: 'core', name: 'ent_sht_steam', scale: 1, duration: 2000 }
    case 'setState': return { type, key: 'open', toggle: true }
    case 'swapModel': return { type, model: '' }
    case 'pickup': return { type, respawn: 300 }
  }
}

export const TEMPLATES: { id: string; label: string; icon: IconName; hint: string; make: () => Partial<Interaction> }[] = [
  { id: 'blank', label: 'Blank', icon: 'Plus', hint: 'Start from nothing', make: () => ({ label: 'New interaction', icon: 'fas fa-hand', steps: [] }) },
  { id: 'use', label: 'Use with an item', icon: 'Wrench', hint: 'Needs an item, progress, then a reward', make: () => ({
    label: 'Use', icon: 'fas fa-wrench', gates: { items: { screwdriver: 1 } },
    steps: [newStep('progress'), { type: 'removeItem', item: 'screwdriver', count: 1 }, { type: 'giveItem', item: 'metalscrap', count: 2 }, { type: 'notify', text: 'Done.', kind: 'success' }],
  }) },
  { id: 'buy', label: 'Buy something', icon: 'ShoppingCart', hint: 'Takes money, gives an item', make: () => ({
    label: 'Buy coffee ($5)', icon: 'fas fa-mug-hot',
    steps: [{ type: 'removeMoney', account: 'cash', amount: 5 }, { type: 'progress', duration: 2500, label: 'Pouring', canCancel: false, freeze: true }, { type: 'giveItem', item: 'coffee', count: 1 }],
  }) },
  { id: 'pickup', label: 'Pick up', icon: 'HandGrabbing', hint: 'Prop disappears and gives an item, comes back later', make: () => ({
    label: 'Pick up', icon: 'fas fa-hand-holding',
    steps: [{ type: 'progress', duration: 1500, label: 'Picking up', anim: { dict: 'pickup_object', clip: 'pickup_low', flag: 0 }, canCancel: true, freeze: true }, { type: 'pickup', respawn: 600, item: 'water', count: 1 }],
  }) },
  { id: 'toggle', label: 'Open and close', icon: 'Door', hint: 'Flips a state other interactions can check', make: () => ({
    label: 'Open', icon: 'fas fa-box-open', steps: [{ type: 'setState', key: 'open', toggle: true }, { type: 'sound', name: 'SELECT', set: 'HUD_FRONTEND_DEFAULT_SOUNDSET' }],
  }) },
  { id: 'event', label: 'Run my event', icon: 'Plug', hint: 'Hands off to your own script', make: () => ({
    label: 'Use', icon: 'fas fa-hand', steps: [{ type: 'clientEvent', name: 'myresource:client:use' }],
  }) },
]

export function blankInteraction(t = TEMPLATES[0], index = 0): Interaction {
  const base = t.make()
  return {
    id: `${t.id}_${Math.random().toString(36).slice(2, 6)}`, label: base.label ?? 'New interaction', icon: base.icon ?? 'fas fa-hand',
    distance: 2, gates: base.gates ?? {}, steps: base.steps ?? [], enabled: true, order: index, radius: 0.35, point: null,
  }
}

// Accessors for model profile or placement interaction lists.
export function ownerList(owner: Owner): Interaction[] {
  const s = app.get()
  if (owner.kind === 'model') return s.models[owner.model]?.interactions ?? []
  return s.placements[owner.id]?.interactions ?? []
}

export async function saveOwner(owner: Owner, list: Interaction[]) {
  const s = app.get()
  const ordered = list.map((i, n) => ({ ...i, order: n }))
  if (owner.kind === 'model') {
    const m: Model = s.models[owner.model] ?? ({ model: owner.model, label: owner.model } as Model)
    const res = await rpc('model:save', { model: { ...m, interactions: ordered } })
    if (replied(res, 'Interactions saved.') && res.model) { refreshModel(res.model); return true }
    return false
  }
  const p: Placement = s.placements[owner.id]
  if (!p) return false
  const res = await rpc('placement:save', { placement: { ...p, interactions: ordered } })
  if (replied(res, 'Interactions saved.') && res.placement) {
    app.set((x) => ({ placements: { ...x.placements, [p.id]: res.placement } }))
    return true
  }
  return false
}

function Card({ i, from, onEdit, onToggle, onUp, onDown, onCopy, onDelete, onTest, onOverride }: {
  i: Interaction; from?: string; onEdit?: () => void; onToggle?: (v: boolean) => void; onUp?: () => void; onDown?: () => void
  onCopy?: () => void; onDelete?: () => void; onTest?: () => void; onOverride?: () => void
}) {
  const g = i.gates ?? {}
  const flags: string[] = []
  if (g.groups) flags.push(Object.keys(g.groups).join(', '))
  if (g.items) flags.push(Object.entries(g.items).map(([k, n]) => `${n}× ${k}`).join(g.anyItem ? ' or ' : ' + '))
  if (g.cooldown) flags.push(`${g.cooldown}s cooldown`)
  if (g.state) flags.push(Object.entries(g.state).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', '))
  return (
    <div className={cx('ia-card group', i.enabled === false && 'is-off', from && 'is-inherited')} onClick={onEdit}>
      <span className="ia-icon" style={i.iconColor ? { color: i.iconColor } : undefined}><Icon name={faPreview(i.icon)} size={18} weight="duotone" /></span>
      <span className="ia-main">
        <span className="ia-title">{i.label}{from && <span className="ia-from">from {from}</span>}</span>
        <span className="ia-flow">
          {i.steps.length === 0 ? <span className="ia-empty">No steps yet</span> : i.steps.slice(0, 4).map((s, n) => (
            <span key={n} className={cx('ia-step', STEP_META[s.type].side === 'server' && 'is-server')} title={stepSummary(s)}>
              <Icon name={STEP_META[s.type].icon} size={12} />
              <span>{stepSummary(s)}</span>
            </span>
          ))}
          {i.steps.length > 4 && <span className="ia-more num">+{i.steps.length - 4}</span>}
        </span>
        <span className="ia-meta">
          <span className="meta"><Icon name={i.point ? 'Crosshair' : 'Cube'} size={12} />{i.point ? 'Point' : 'Whole prop'}</span>
          <span className="meta num">{i.distance.toFixed(1)} m</span>
          {flags.map((f) => <span key={f} className="meta"><Icon name="Lock" size={12} />{f}</span>)}
        </span>
      </span>
      <span className="ia-actions" onClick={(e) => e.stopPropagation()}>
        {onTest && <IconBtn size="s" icon="Play" title="Test now (runs for real)" onClick={onTest} />}
        {onOverride && <Button size="s" variant="quiet" onClick={onOverride}>Override</Button>}
        {onToggle && <span className="mini-switch" onClick={() => onToggle(i.enabled === false)} title={i.enabled === false ? 'Off' : 'On'}><span className={cx('switch', i.enabled !== false && 'is-on')}><span className="switch-knob" /></span></span>}
        {(onUp || onDelete) && (
          <Menu trigger={(open) => <IconBtn size="s" icon="DotsThree" title="More" onClick={open} />} items={[
            ...(onUp ? [{ label: 'Move up', icon: 'ArrowUp' as IconName, onClick: onUp }] : []),
            ...(onDown ? [{ label: 'Move down', icon: 'ArrowDown' as IconName, onClick: onDown }] : []),
            ...(onCopy ? [{ label: 'Duplicate', icon: 'Copy' as IconName, onClick: onCopy }] : []),
            'sep' as const,
            ...(onDelete ? [{ label: 'Delete', icon: 'Trash' as IconName, tone: 'bad' as const, onClick: onDelete }] : []),
          ]} />
        )}
      </span>
    </div>
  )
}

export function InteractionsList({ owner }: { owner: Owner }) {
  const list = useApp((s) => (owner.kind === 'model' ? s.models[owner.model]?.interactions : s.placements[owner.id]?.interactions)) ?? []
  const placement = useApp((s) => (owner.kind === 'placement' ? s.placements[owner.id] : undefined))
  const parent = useApp((s) => (placement ? s.models[placement.model] : undefined))
  const boot = useApp((s) => s.boot)

  const edit = (index: number, interaction: Interaction) => hub.set({ draft: { owner, index, interaction: clone(interaction), dirty: index < 0 } })
  const add = (t = TEMPLATES[0]) => edit(-1, blankInteraction(t, list.length))
  const mutate = (fn: (l: Interaction[]) => Interaction[]) => saveOwner(owner, fn(clone(list)))
  const move = (n: number, d: number) => mutate((l) => { const [x] = l.splice(n, 1); l.splice(n + d, 0, x); return l })
  const mine = new Set(list.map((i) => i.id))
  const inherited = placement && placement.inherit !== false ? (parent?.interactions ?? []).filter((i) => !mine.has(i.id)) : []

  return (
    <div className="ia-list">
      {boot?.target === 'none' && (
        <div className="callout callout--warn"><Icon name="Warning" size={16} weight="fill" /><span>No target script is running, so players will not see these options. PropKit supports osm-target, ox_target and qb-target.</span></div>
      )}
      <div className="ia-list-head">
        <span className="ia-list-title">{owner.kind === 'model' ? 'On every copy of this model' : 'On this placement'}</span>
        <Menu trigger={(open) => <Button size="s" variant="primary" icon="Plus" onClick={open}>Add</Button>} items={TEMPLATES.map((t) => ({ label: t.label, icon: t.icon, hint: t.hint, onClick: () => add(t) }))} />
      </div>
      {list.length === 0 && inherited.length === 0 && (
        <Empty icon="Hand" title="No interactions" body="Interactions are what players can do with the prop through their target menu: use it, buy from it, pick it up, or run your own event." action={<Button icon="Plus" variant="ghost" onClick={() => add(TEMPLATES[1])}>Start from a template</Button>} />
      )}
      {list.map((i, n) => (
        <Card key={i.id} i={i} onEdit={() => edit(n, i)}
          onToggle={(v) => mutate((l) => { l[n].enabled = v; return l })}
          onUp={n > 0 ? () => move(n, -1) : undefined} onDown={n < list.length - 1 ? () => move(n, 1) : undefined}
          onCopy={() => mutate((l) => { l.splice(n + 1, 0, { ...clone(i), id: `${i.id}_copy`, label: `${i.label} (copy)`, origin: undefined }); return l })}
          onDelete={async () => { if (await confirm({ title: `Delete "${i.label}"?`, confirm: 'Delete', tone: 'bad', icon: 'Trash' })) mutate((l) => { l.splice(n, 1); return l }) }}
          onTest={owner.kind === 'placement' ? () => fetchNui('hub:test', { id: owner.id, interaction: i.id, close: true }) : undefined} />
      ))}
      {placement && (
        <div className="ia-inherit">
          <Switch checked={placement.inherit !== false} label="Use the model's interactions too" hint={parent ? `${parent.interactions.length} on ${parent.label}` : 'The model has no profile yet'}
            onChange={async (v) => { const res = await rpc('placement:save', { placement: { ...placement, inherit: v } }); replied(res) }} />
          {inherited.map((i) => (
            <Card key={i.id} i={i} from={parent?.label}
              onEdit={() => hub.set({ sheet: { kind: 'model', model: placement.model, tab: 'interactions' } })}
              onOverride={() => edit(-1, { ...clone(i), origin: undefined })}
              onTest={() => fetchNui('hub:test', { id: placement.id, interaction: i.id, close: true })} />
          ))}
        </div>
      )}
    </div>
  )
}
