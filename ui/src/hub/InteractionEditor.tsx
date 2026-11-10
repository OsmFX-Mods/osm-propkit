import { useState } from 'react'
import { useApp, toast } from '../lib/store'
import { fetchNui } from '../lib/nui'
import { Icon, type IconName } from '../lib/icons'
import { Button, ColorField, Combo, Field, IconBtn, Input, Menu, NumberField, Section, Segmented, Select, Slider, Switch, TextArea, confirm } from '../kit/ui'
import { clone, cx, slug } from '../lib/format'
import type { Gates, Interaction, Step, StepType } from '../lib/types'
import { hub, useHub } from './state'
import { STEP_META, faPreview, newStep, ownerList, saveOwner, stepSummary } from './Interactions'
import { SheetHead } from './ModelSheet'

function useDraft() {
  const draft = useHub((v) => v.draft)!
  const set = (p: Partial<Interaction>) => hub.set((v) => ({ draft: v.draft ? { ...v.draft, interaction: { ...v.draft.interaction, ...p }, dirty: true } : null }))
  return { draft, i: draft.interaction, set }
}

// Target menu preview representation.
function Preview({ i }: { i: Interaction }) {
  const target = useApp((s) => s.boot?.target)
  return (
    <div className="ia-preview">
      <span className="ia-preview-tag">Player sees</span>
      <div className="ia-preview-card">
        <span className="ia-preview-icon" style={i.iconColor ? { color: i.iconColor } : undefined}><Icon name={faPreview(i.icon)} size={18} weight="fill" /></span>
        <span className="ia-preview-text">
          <span className="ia-preview-label">{i.label || 'Untitled'}</span>
          {target === 'osm' && i.description && <span className="ia-preview-desc">{i.description}</span>}
        </span>
        <span className="kbd">E</span>
      </div>
    </div>
  )
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const icons = useApp((s) => s.boot?.catalog.icons ?? [])
  return (
    <div className="icon-picker">
      <div className="icon-grid">
        {icons.map((ic) => (
          <button type="button" key={ic.fa} title={ic.fa} className={cx('icon-cell', value === ic.fa && 'is-on')} onClick={() => onChange(ic.fa)}>
            <Icon name={ic.preview as IconName} size={17} weight={value === ic.fa ? 'fill' : 'regular'} />
          </button>
        ))}
      </div>
      <Input value={value} onChange={onChange} mono placeholder="fas fa-hand" icon="Code" />
    </div>
  )
}

// Key-count row editor for group permissions and required items.
function KeyCount({ value, onChange, keyLabel, numLabel, placeholder, min = 0 }: { value?: Record<string, number>; onChange: (v?: Record<string, number>) => void; keyLabel: string; numLabel: string; placeholder: string; min?: number }) {
  const rows = Object.entries(value ?? {})
  const write = (r: [string, number][]) => { const o = Object.fromEntries(r.filter(([k]) => k.trim())); onChange(Object.keys(o).length ? o : undefined) }
  const [draftKey, setDraftKey] = useState('')
  return (
    <div className="kc">
      {rows.map(([k, n], idx) => (
        <div key={idx} className="kc-row">
          <Input value={k} onChange={(v) => write(rows.map((r, j) => (j === idx ? [v, r[1]] : r)))} mono />
          <NumberField value={n} onChange={(v) => write(rows.map((r, j) => (j === idx ? [r[0], v] : r)))} step={1} min={min} precision={0} label={numLabel} compact />
          <IconBtn size="s" icon="X" title="Remove" onClick={() => write(rows.filter((_, j) => j !== idx))} />
        </div>
      ))}
      <div className="kc-row kc-add">
        <Input value={draftKey} onChange={setDraftKey} placeholder={placeholder} mono onEnter={() => { if (draftKey.trim()) { write([...rows, [draftKey.trim(), min]]); setDraftKey('') } }} />
        <Button size="s" variant="quiet" icon="Plus" disabled={!draftKey.trim()} onClick={() => { write([...rows, [draftKey.trim(), min]]); setDraftKey('') }}>{keyLabel}</Button>
      </div>
    </div>
  )
}

function JsonField({ value, onChange, placeholder }: { value: unknown; onChange: (v: unknown) => void; placeholder?: string }) {
  const [text, setText] = useState(value === undefined ? '' : JSON.stringify(value, null, 1))
  const [bad, setBad] = useState(false)
  return (
    <>
      <TextArea value={text} rows={3} mono placeholder={placeholder ?? '{ "any": "json" }'} onChange={(t) => {
        setText(t)
        if (!t.trim()) { setBad(false); onChange(undefined); return }
        try { onChange(JSON.parse(t)); setBad(false) } catch { setBad(true) }
      }} />
      {bad && <span className="field-hint tone-bad">Not valid JSON yet, the last valid value is kept.</span>}
    </>
  )
}

function AnimFields({ value, onChange, allowScenario = true }: { value?: Step['anim']; onChange: (a?: Step['anim']) => void; allowScenario?: boolean }) {
  const cat = useApp((s) => s.boot?.catalog)
  const kind = value?.scenario ? 'scenario' : value?.dict ? 'anim' : 'none'
  return (
    <div className="stack-s">
      <Segmented size="s" value={kind} onChange={(k) => onChange(k === 'none' ? undefined : k === 'scenario' ? { scenario: cat?.scenarios[0] } : { dict: cat?.anims[0].dict, clip: cat?.anims[0].clip, flag: cat?.anims[0].flag })}
        options={[{ value: 'none', label: 'None' }, { value: 'anim', label: 'Animation' }, ...(allowScenario ? [{ value: 'scenario' as const, label: 'Scenario' }] : [])]} />
      {kind === 'anim' && (
        <>
          <Field label="Quick pick">
            <Select value="" placeholder="Choose a preset" options={(cat?.anims ?? []).map((a, n) => ({ value: String(n), label: a.label }))}
              onChange={(n) => { const a = cat!.anims[+n]; onChange({ dict: a.dict, clip: a.clip, flag: a.flag }) }} />
          </Field>
          <div className="grid-2">
            <Field label="Dictionary"><Input value={value?.dict ?? ''} onChange={(v) => onChange({ ...value, dict: v })} mono /></Field>
            <Field label="Clip"><Input value={value?.clip ?? ''} onChange={(v) => onChange({ ...value, clip: v })} mono /></Field>
          </div>
          <Field label="Flag" hint="1 loops, 49 loops on the upper body so the player can still walk, 0 plays once">
            <NumberField value={value?.flag ?? 1} onChange={(v) => onChange({ ...value, flag: v })} step={1} min={0} max={1023} precision={0} />
          </Field>
        </>
      )}
      {kind === 'scenario' && (
        <Field label="Scenario"><Combo value={value?.scenario ?? ''} onChange={(v) => onChange({ scenario: v })} options={(cat?.scenarios ?? []).map((s) => ({ value: s }))} mono /></Field>
      )}
    </div>
  )
}

function StepFields({ s, set }: { s: Step; set: (p: Partial<Step>) => void }) {
  const boot = useApp((x) => x.boot)
  const cat = boot?.catalog
  const accounts = (boot?.interact.accounts ?? ['cash', 'bank']).map((a) => ({ value: a, label: a }))
  switch (s.type) {
    case 'progress': return (
      <>
        <div className="grid-2">
          <Field label="Text"><Input value={s.label ?? ''} onChange={(v) => set({ label: v })} /></Field>
          <Field label="Duration"><NumberField value={(s.duration ?? 0) / 1000} onChange={(v) => set({ duration: Math.round(v * 1000) })} step={0.1} min={0.25} max={600} precision={1} unit="s" /></Field>
        </div>
        <div className="grid-2">
          <Switch checked={s.canCancel !== false} onChange={(v) => set({ canCancel: v })} label="Can cancel" />
          <Switch checked={s.freeze !== false} onChange={(v) => set({ freeze: v })} label="Hold still" />
        </div>
        <Field label="Animation while it runs"><AnimFields value={s.anim} onChange={(a) => set({ anim: a })} /></Field>
      </>
    )
    case 'anim': return (
      <>
        <AnimFields value={s.anim} onChange={(a) => set({ anim: a })} />
        <Field label="Play for" hint="0 leaves it running into the next step"><NumberField value={(s.duration ?? 0) / 1000} onChange={(v) => set({ duration: Math.round(v * 1000) })} step={0.1} min={0} precision={1} unit="s" /></Field>
      </>
    )
    case 'wait': return <Field label="Wait"><NumberField value={(s.duration ?? 0) / 1000} onChange={(v) => set({ duration: Math.round(v * 1000) })} step={0.1} min={0} precision={1} unit="s" /></Field>
    case 'giveItem': case 'removeItem': return (
      <>
        <div className="grid-2">
          <Field label="Item"><Input value={s.item ?? ''} onChange={(v) => set({ item: v })} mono placeholder="water" /></Field>
          <Field label="Count"><NumberField value={s.count ?? 1} onChange={(v) => set({ count: v })} step={1} min={1} precision={0} /></Field>
        </div>
        {s.type === 'giveItem' && <Field label="Metadata" hint="Optional, ox_inventory and qb item info"><JsonField value={s.metadata} onChange={(v) => set({ metadata: v })} /></Field>}
        {s.type === 'removeItem' && <p className="field-hint">Stops the interaction if the player does not have enough.</p>}
      </>
    )
    case 'giveMoney': case 'removeMoney': return (
      <div className="grid-2">
        <Field label="Account"><Select value={s.account ?? 'cash'} options={accounts} onChange={(v) => set({ account: v })} /></Field>
        <Field label="Amount"><NumberField value={s.amount ?? 0} onChange={(v) => set({ amount: v })} step={1} min={0} precision={0} unit="$" /></Field>
      </div>
    )
    case 'clientEvent': case 'serverEvent': return (
      <>
        <Field label="Event name"><Input value={s.name ?? ''} onChange={(v) => set({ name: v })} mono placeholder="myresource:use" /></Field>
        {s.type === 'serverEvent' && (
          <Field label="How it is sent" hint={s.via === 'internal'
            ? 'Fired by PropKit on the server after every check. Your handler gets (source, data). Use AddEventHandler.'
            : 'Sent by the player like any target option. Your handler uses source. Use RegisterNetEvent and validate there.'}>
            <Segmented full size="s" value={s.via ?? 'net'} onChange={(v) => set({ via: v })} options={[{ value: 'net', label: 'From the client' }, { value: 'internal', label: 'From the server (checked)' }]} />
          </Field>
        )}
        <Field label="Extra data" hint="Sent as data.args. The handler also gets placement, model, coords and the entity"><JsonField value={s.args} onChange={(v) => set({ args: v })} /></Field>
      </>
    )
    case 'export': return (
      <>
        <div className="grid-2">
          <Field label="Resource"><Input value={s.resource ?? ''} onChange={(v) => set({ resource: v })} mono /></Field>
          <Field label="Function"><Input value={s.fn ?? ''} onChange={(v) => set({ fn: v })} mono /></Field>
        </div>
        <Field label="Side"><Segmented full size="s" value={s.side ?? 'client'} onChange={(v) => set({ side: v })} options={[{ value: 'client', label: 'Client' }, { value: 'server', label: 'Server (after checks)' }]} /></Field>
        <Field label="Extra data"><JsonField value={s.args} onChange={(v) => set({ args: v })} /></Field>
        {!boot?.interact.exports && <p className="field-hint tone-warn">Exports are turned off in config (Config.Interact.allowExports).</p>}
      </>
    )
    case 'command': return (
      <>
        <Field label="Command" hint="Without the slash, runs as the player"><Input value={s.command ?? ''} onChange={(v) => set({ command: v.replace(/^\//, '') })} mono /></Field>
        {!boot?.interact.commands && <p className="field-hint tone-warn">Commands are turned off in config (Config.Interact.allowCommands).</p>}
      </>
    )
    case 'notify': return (
      <div className="grid-2">
        <Field label="Text"><Input value={s.text ?? ''} onChange={(v) => set({ text: v })} /></Field>
        <Field label="Kind"><Select value={s.kind ?? 'info'} options={[{ value: 'info', label: 'Info' }, { value: 'success', label: 'Success' }, { value: 'warning', label: 'Warning' }, { value: 'error', label: 'Error' }]} onChange={(v) => set({ kind: v })} /></Field>
      </div>
    )
    case 'sound': return (
      <>
        <Field label="Quick pick"><Select value="" placeholder="Choose a sound" options={(cat?.sounds ?? []).map((x, n) => ({ value: String(n), label: x.label }))} onChange={(n) => { const x = cat!.sounds[+n]; set({ name: x.name, set: x.set }) }} /></Field>
        <div className="grid-2">
          <Field label="Name"><Input value={s.name ?? ''} onChange={(v) => set({ name: v })} mono /></Field>
          <Field label="Sound set"><Input value={s.set ?? ''} onChange={(v) => set({ set: v })} mono /></Field>
        </div>
      </>
    )
    case 'ptfx': return (
      <>
        <Field label="Quick pick"><Select value="" placeholder="Choose an effect" options={(cat?.ptfx ?? []).map((x, n) => ({ value: String(n), label: x.label }))} onChange={(n) => { const x = cat!.ptfx[+n]; set({ asset: x.asset, name: x.name, scale: x.scale }) }} /></Field>
        <div className="grid-2">
          <Field label="Asset"><Input value={s.asset ?? ''} onChange={(v) => set({ asset: v })} mono /></Field>
          <Field label="Effect"><Input value={s.name ?? ''} onChange={(v) => set({ name: v })} mono /></Field>
        </div>
        <div className="grid-2">
          <Field label="Scale"><NumberField value={s.scale ?? 1} onChange={(v) => set({ scale: v })} step={0.05} min={0.05} max={10} /></Field>
          <Field label="Lasts"><NumberField value={(s.duration ?? 2000) / 1000} onChange={(v) => set({ duration: Math.round(v * 1000) })} step={0.1} min={0.1} precision={1} unit="s" /></Field>
        </div>
        <p className="field-hint">Plays at the interaction point, or the prop's origin for whole-prop options.</p>
      </>
    )
    case 'setState': return (
      <>
        <div className="grid-2">
          <Field label="Key"><Input value={s.key ?? ''} onChange={(v) => set({ key: slug(v) })} mono placeholder="open" /></Field>
          <Field label="Change"><Segmented full size="s" value={s.toggle ? 'toggle' : 'set'} onChange={(v) => set({ toggle: v === 'toggle' })} options={[{ value: 'toggle', label: 'Flip' }, { value: 'set', label: 'Set to' }]} /></Field>
        </div>
        {!s.toggle && <Field label="Value"><JsonField value={s.value} onChange={(v) => set({ value: v })} placeholder="true" /></Field>}
        <Switch checked={!!s.persist} onChange={(v) => set({ persist: v })} label="Keep after restart" />
        <p className="field-hint">Other interactions can require this state under Requirements, for example only show Close when open is true.</p>
      </>
    )
    case 'swapModel': return (
      <>
        <Field label="Swap to model" hint="Running it again swaps back"><Input value={s.model ?? ''} onChange={(v) => set({ model: v })} mono placeholder="prop_name_open" /></Field>
        <Switch checked={!!s.persist} onChange={(v) => set({ persist: v })} label="Keep after restart" />
      </>
    )
    case 'pickup': return (
      <>
        <Field label="Comes back after" hint="0 keeps it gone until the next restart"><NumberField value={s.respawn ?? 0} onChange={(v) => set({ respawn: v })} step={10} min={0} precision={0} unit="s" /></Field>
        <div className="grid-2">
          <Field label="Give item (optional)"><Input value={s.item ?? ''} onChange={(v) => set({ item: v || undefined })} mono /></Field>
          <Field label="Count"><NumberField value={s.count ?? 1} onChange={(v) => set({ count: v })} step={1} min={1} precision={0} /></Field>
        </div>
      </>
    )
  }
}

function StepCard({ s, n, total, open, onOpen, set, remove, move }: { s: Step; n: number; total: number; open: boolean; onOpen: () => void; set: (p: Partial<Step>) => void; remove: () => void; move: (d: number) => void }) {
  const meta = STEP_META[s.type]
  const server = meta.side === 'server' || (s.type === 'serverEvent' && s.via === 'internal') || (s.type === 'export' && s.side === 'server')
  return (
    <div className={cx('step', open && 'is-open')}>
      <div className="step-head" onClick={onOpen}>
        <span className="step-n num">{n + 1}</span>
        <span className="step-icon"><Icon name={meta.icon} size={15} /></span>
        <span className="step-title">{meta.label}</span>
        <span className="step-sum">{stepSummary(s)}</span>
        <span className={cx('step-side', server && 'is-server')} title={server ? 'Runs on the server after it checks the player' : 'Runs on the player\'s client'}>{server ? 'server' : 'client'}</span>
        <span className="step-tools" onClick={(e) => e.stopPropagation()}>
          <IconBtn size="s" icon="ArrowUp" title="Earlier" disabled={n === 0} onClick={() => move(-1)} />
          <IconBtn size="s" icon="ArrowDown" title="Later" disabled={n === total - 1} onClick={() => move(1)} />
          <IconBtn size="s" icon="Trash" title="Remove step" tone="bad" onClick={remove} />
        </span>
        <Icon name={open ? 'CaretUp' : 'CaretDown'} size={13} className="step-caret" />
      </div>
      {open && <div className="step-body"><StepFields s={s} set={set} /></div>}
    </div>
  )
}

const GROUPS = ['Timing', 'Rewards', 'Costs', 'Triggers', 'Feedback', 'Prop'] as const

export function InteractionEditor() {
  const { draft, i, set } = useDraft()
  const boot = useApp((s) => s.boot)
  const placement = useApp((s) => (draft.owner.kind === 'placement' ? s.placements[draft.owner.id] : undefined))
  const [openStep, setOpenStep] = useState<number>(i.steps.length ? -1 : -1)
  const [busy, setBusy] = useState(false)
  const g = i.gates ?? {}
  const setGates = (p: Partial<Gates>) => set({ gates: { ...g, ...p } })
  const setStep = (n: number, p: Partial<Step>) => set({ steps: i.steps.map((s, j) => (j === n ? { ...s, ...p } : s)) })
  const max = boot?.interact.maxSteps ?? 24

  const leave = async () => {
    if (draft.dirty && !(await confirm({ title: 'Discard changes?', body: 'This interaction has unsaved changes.', confirm: 'Discard', tone: 'bad' }))) return
    hub.set({ draft: null })
  }

  const save = async () => {
    if (!i.label.trim()) return toast('Give it a label first.', 'error')
    setBusy(true)
    const list = clone(ownerList(draft.owner))
    const clean = { ...i, id: slug(i.id || i.label) }
    if (draft.index >= 0 && draft.index < list.length) list[draft.index] = clean
    else {
      let id = clean.id, k = 2
      while (list.some((x) => x.id === id)) id = `${clean.id}_${k++}`
      list.push({ ...clean, id })
    }
    const ok = await saveOwner(draft.owner, list)
    setBusy(false)
    if (ok) hub.set({ draft: null })
  }

  const pick = () => {
    const o = draft.owner
    hub.set({ pickFor: { owner: o, index: draft.index } })
    fetchNui('hub:points', o.kind === 'placement' ? { id: o.id, interaction: i.id } : { model: o.model, interaction: i.id })
  }

  const ownerName = draft.owner.kind === 'model' ? draft.owner.model : placement?.label || placement?.model

  return (
    <div className="sheet-inner">
      <SheetHead back={leave} title={draft.index < 0 ? 'New interaction' : i.label || 'Interaction'} sub={<>on <span className="num">{ownerName}</span></>} />
      <div className="sheet-scroll ia-editor">
        <Preview i={i} />
        <Section title="Option">
          <div className="grid-2">
            <Field label="Label"><Input value={i.label} onChange={(v) => set({ label: v })} maxLength={80} autoFocus={draft.index < 0} /></Field>
            <Field label="Key" hint="Stable id, used by packs to match updates"><Input value={i.id} onChange={(v) => set({ id: slug(v) })} mono /></Field>
          </div>
          {boot?.target === 'osm' && <Field label="Description" hint="osm-target shows it under the label"><Input value={i.description ?? ''} onChange={(v) => set({ description: v || undefined })} maxLength={160} /></Field>}
          <Field label="Icon"><IconPicker value={i.icon} onChange={(v) => set({ icon: v })} /></Field>
          <Field label="Icon colour" aside={i.iconColor && <button type="button" className="link" onClick={() => set({ iconColor: undefined })}>Use default</button>}>
            <ColorField value={i.iconColor ?? '#ffffff'} onChange={(v) => set({ iconColor: v })} />
          </Field>
          <Field label="Reach" hint="How close the player must stand">
            <Slider value={i.distance} min={0.5} max={10} step={0.1} onChange={(v) => set({ distance: v })} format={(v) => `${v.toFixed(1)} m`} />
          </Field>
        </Section>

        <Section title="Where on the prop">
          <Segmented full value={i.point ? 'point' : 'whole'} onChange={(v) => set({ point: v === 'point' ? { x: 0, y: 0, z: 0.5 } : null })} options={[
            { value: 'whole', label: 'Whole prop', icon: 'Cube' }, { value: 'point', label: 'A point on it', icon: 'Crosshair' },
          ]} />
          {i.point && (
            <>
              <div className="vec-edit">
                {(['x', 'y', 'z'] as const).map((k) => (
                  <NumberField key={k} axis={k} value={i.point![k]} step={0.005} precision={3} unit="m" onChange={(v) => set({ point: { ...i.point!, [k]: v } })} />
                ))}
              </div>
              <div className="grid-2 align-end">
                <Field label="Hit radius" hint="How close to the point the aim must land"><NumberField value={i.radius ?? 0.35} onChange={(v) => set({ radius: v })} step={0.01} min={0.05} max={5} precision={2} unit="m" /></Field>
                <Button variant="ghost" icon="CursorClick" onClick={pick}>Pick on the prop</Button>
              </div>
              {boot?.target === 'qb' && <p className="field-hint">qb-target has no per-option offsets, PropKit adds a small sphere zone at this point instead.</p>}
            </>
          )}
        </Section>

        <Section title="Requirements" sub="Checked again on the server before anything is given or taken.">
          <Field label="Jobs or gangs" hint="Any one of them, at this grade or higher. Leave empty for everyone.">
            <KeyCount value={g.groups} onChange={(v) => setGates({ groups: v })} keyLabel="Group" numLabel="min" placeholder="police" />
          </Field>
          <Field label="Items" aside={g.items && Object.keys(g.items).length > 1 && <Segmented size="s" value={g.anyItem ? 'any' : 'all'} onChange={(v) => setGates({ anyItem: v === 'any' })} options={[{ value: 'all', label: 'All of' }, { value: 'any', label: 'Any of' }]} />}>
            <KeyCount value={g.items} onChange={(v) => setGates({ items: v })} keyLabel="Item" numLabel="×" placeholder="lockpick" min={1} />
          </Field>
          <div className="grid-2">
            <Field label="Cooldown"><NumberField value={g.cooldown ?? 0} onChange={(v) => setGates({ cooldown: v || undefined, cooldownScope: v ? g.cooldownScope ?? 'player' : undefined })} step={5} min={0} precision={0} unit="s" /></Field>
            <Field label="Cooldown applies to">
              <Select value={g.cooldownScope ?? 'player'} onChange={(v) => setGates({ cooldownScope: v })} options={[{ value: 'player', label: 'Each player' }, { value: 'placement', label: 'This prop, everyone' }, { value: 'global', label: 'Every copy, everyone' }]} />
            </Field>
          </div>
          <Field label="Prop state" hint="Only show while the prop's state matches, see the Set state step">
            <KeyCountState value={g.state} onChange={(v) => setGates({ state: v })} />
          </Field>
          <div className="switch-list">
            <Switch checked={!!g.hideIneligible} onChange={(v) => setGates({ hideIneligible: v || undefined })} label="Hide when the player does not qualify" hint="Otherwise it shows and explains why it fails" />
            <Switch checked={!!g.onFoot} onChange={(v) => setGates({ onFoot: v || undefined })} label="On foot only" />
            <Switch checked={!!g.hours} onChange={(v) => setGates({ hours: v ? [8, 20] : undefined })} label="Only during in-game hours" />
          </div>
          {g.hours && (
            <div className="grid-2">
              <Field label="From"><NumberField value={g.hours[0]} onChange={(v) => setGates({ hours: [v, g.hours![1]] })} step={1} min={0} max={23} precision={0} unit="h" /></Field>
              <Field label="Until"><NumberField value={g.hours[1]} onChange={(v) => setGates({ hours: [g.hours![0], v] })} step={1} min={0} max={24} precision={0} unit="h" /></Field>
            </div>
          )}
        </Section>

        <Section title="What happens" sub="Steps run in order and stop at the first one that fails." aside={
          <Menu trigger={(open) => <Button size="s" variant="primary" icon="Plus" onClick={open} disabled={i.steps.length >= max}>Step</Button>}
            items={GROUPS.flatMap((grp, gi) => [
              ...(gi ? ['sep' as const] : []),
              ...(Object.keys(STEP_META) as StepType[]).filter((t) => STEP_META[t].group === grp).map((t) => ({
                label: STEP_META[t].label, icon: STEP_META[t].icon, hint: grp,
                onClick: () => { set({ steps: [...i.steps, newStep(t)] }); setOpenStep(i.steps.length) },
              })),
            ])} />
        }>
          {i.steps.length === 0
            ? <div className="steps-empty"><Icon name="FlowArrow" size={20} weight="duotone" /><span>Add a step, for example a progress bar then Give item.</span></div>
            : <div className="steps">
              {i.steps.map((s, n) => (
                <StepCard key={n} s={s} n={n} total={i.steps.length} open={openStep === n} onOpen={() => setOpenStep(openStep === n ? -1 : n)}
                  set={(p) => setStep(n, p)}
                  remove={() => { set({ steps: i.steps.filter((_, j) => j !== n) }); setOpenStep(-1) }}
                  move={(d) => { const l = [...i.steps]; const [x] = l.splice(n, 1); l.splice(n + d, 0, x); set({ steps: l }); setOpenStep(n + d) }} />
              ))}
            </div>}
        </Section>
      </div>
      <footer className="save-bar is-dirty">
        <span className="save-bar-note">{draft.dirty ? 'Unsaved changes' : 'No changes'}</span>
        <Switch checked={i.enabled !== false} onChange={(v) => set({ enabled: v })} label="On" />
        <Button variant="quiet" size="s" onClick={leave}>Cancel</Button>
        <Button variant="primary" size="s" icon="FloppyDisk" busy={busy} onClick={save}>Save</Button>
      </footer>
    </div>
  )
}

// State requirement row editor.
function KeyCountState({ value, onChange }: { value?: Record<string, unknown>; onChange: (v?: Record<string, unknown>) => void }) {
  const rows = Object.entries(value ?? {})
  const [k, setK] = useState('')
  const write = (r: [string, unknown][]) => { const o = Object.fromEntries(r); onChange(Object.keys(o).length ? o : undefined) }
  return (
    <div className="kc">
      {rows.map(([key, v], idx) => (
        <div key={key} className="kc-row">
          <span className="kc-key num">{key}</span>
          <Segmented size="s" value={v === true ? 'true' : v === false ? 'false' : 'other'} onChange={(x) => write(rows.map((r, j) => (j === idx ? [r[0], x === 'true'] : r)))}
            options={[{ value: 'true', label: 'is true' }, { value: 'false', label: 'is false' }]} />
          <IconBtn size="s" icon="X" title="Remove" onClick={() => write(rows.filter((_, j) => j !== idx))} />
        </div>
      ))}
      <div className="kc-row kc-add">
        <Input value={k} onChange={(v) => setK(slug(v))} placeholder="open" mono onEnter={() => { if (k) { write([...rows, [k, true]]); setK('') } }} />
        <Button size="s" variant="quiet" icon="Plus" disabled={!k} onClick={() => { write([...rows, [k, true]]); setK('') }}>State</Button>
      </div>
    </div>
  )
}
