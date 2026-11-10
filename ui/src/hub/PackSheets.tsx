import { useMemo, useState } from 'react'
import { rpc } from '../lib/nui'
import { replied, toast, useApp } from '../lib/store'
import { Icon } from '../lib/icons'
import { Badge, Button, Empty, Field, Input, Section, Segmented, Slider, Switch, TextArea } from '../kit/ui'
import { cx, slug } from '../lib/format'
import type { Diff, DiffItem } from '../lib/types'
import { hub } from './state'
import { SheetHead } from './ModelSheet'
import { diffCache, reloadPacks, stage } from './Packs'

// Pack import view.
export function ImportSheet() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => {
    if (!text.trim()) return null
    try { const j = JSON.parse(text); return { ok: true, j } } catch (e: any) { return { ok: false, err: String(e.message || e) } }
  }, [text])
  const j = parsed?.ok ? parsed.j : null
  return (
    <div className="sheet-inner">
      <SheetHead title="Import a pack" sub="Paste a pack file, or just the parts you want" onClose={() => hub.set({ sheet: null })} />
      <div className="sheet-scroll">
        <Field label="Pack JSON" hint="Partial files work: a file with only models[].interactions adds those interactions without touching anything else.">
          <TextArea value={text} onChange={setText} rows={14} mono placeholder={'{\n  "format": "osm-propkit/pack@1",\n  "id": "my_pack",\n  "models": [ ... ]\n}'} />
        </Field>
        {parsed && !parsed.ok && <div className="callout callout--bad"><Icon name="WarningCircle" size={16} weight="fill" /><span>{parsed.err}</span></div>}
        {j && (
          <div className="callout"><Icon name="Package" size={16} weight="duotone" />
            <span><b>{j.name ?? j.id ?? 'Unnamed'}</b> {j.version && <span className="num">{j.version}</span>} · {(j.models ?? []).length} models · {(j.placements ?? []).length} placements · {(j.scenes ?? []).length} scenes{!j.id && <span className="tone-bad"> · needs an "id"</span>}</span>
          </div>
        )}
      </div>
      <footer className="save-bar is-dirty">
        <span className="save-bar-note">Nothing changes until you confirm the review.</span>
        <Button variant="primary" size="s" icon="GitDiff" disabled={!j || !j.id} busy={busy} onClick={async () => { setBusy(true); await stage({ text }); setBusy(false) }}>Review changes</Button>
      </footer>
    </div>
  )
}

// Pack diff review view.
type Strategy = 'merge' | 'overwrite' | 'add' | 'replace' | 'skip'
const STRATEGY_HINT: Record<Strategy, string> = {
  merge: 'Adds new items and updates the ones you never changed. Your edits stay.',
  overwrite: 'Adds and updates everything, including items you edited here.',
  add: 'Only adds items you do not have. Nothing existing changes.',
  replace: 'Like overwrite, and also deletes items this pack no longer ships.',
  skip: 'Leaves this section alone.',
}
const STATUS: Record<DiffItem['status'], { label: string; tone: string; icon: any }> = {
  add: { label: 'New', tone: 'ok', icon: 'Plus' },
  update: { label: 'Update', tone: 'info', icon: 'ArrowsClockwise' },
  conflict: { label: 'Edited here', tone: 'warn', icon: 'Warning' },
  removed: { label: 'Not in pack', tone: 'bad', icon: 'Minus' },
  same: { label: 'Same', tone: 'plain', icon: 'Check' },
}

function wants(s: Strategy, st: DiffItem['status']) {
  if (s === 'skip') return false
  if (st === 'add') return true
  if (st === 'update') return s !== 'add'
  if (st === 'conflict') return s === 'overwrite' || s === 'replace'
  if (st === 'removed') return s === 'replace'
  return false
}

const SECTION_LABEL = { models: 'Model profiles', interactions: 'Interactions', placements: 'Placements', scenes: 'Studio scenes' } as const

export function DiffSheet({ token }: { token: string }) {
  const diff: Diff | undefined = diffCache[token]
  const [strat, setStrat] = useState<Record<string, Strategy>>({ models: 'merge', interactions: 'merge', placements: 'merge', scenes: 'merge' })
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!diff) return <Empty icon="GitDiff" title="This review expired" body="Load the pack again from the Packs tab." />

  const sections = (Object.keys(SECTION_LABEL) as (keyof typeof SECTION_LABEL)[]).filter((k) => diff.sections[k].items.length > 0)
  const plan = sections.map((k) => {
    const items = diff.sections[k].items
    const take = items.filter((it) => wants(strat[k], it.status))
    return { k, add: take.filter((i) => i.status === 'add').length, upd: take.filter((i) => i.status === 'update' || i.status === 'conflict').length, del: take.filter((i) => i.status === 'removed').length, kept: items.filter((i) => i.status === 'conflict' && !wants(strat[k], i.status)).length }
  })
  const total = plan.reduce((n, p) => n + p.add + p.upd + p.del, 0)

  const apply = async () => {
    setBusy(true)
    const res = await rpc('packs:apply', { token, strategies: strat })
    setBusy(false)
    if (res?.ok) {
      const d = res.done
      toast(`${diff.pack.name} ${diff.pack.version} installed: ${d.models} profiles, ${d.interactions} interactions, ${d.placements} placements${d.removed ? `, ${d.removed} removed` : ''}.`, 'success')
      delete diffCache[token]
      reloadPacks()
      hub.set({ sheet: null, section: 'packs' })
    } else replied(res)
  }

  return (
    <div className="sheet-inner">
      <SheetHead title={diff.pack.name} sub={<span className="num">{diff.pack.installed ? `${diff.pack.installed} → ${diff.pack.version}` : `${diff.pack.version} · not installed`}{diff.pack.author ? ` · ${diff.pack.author}` : ''}</span>} onClose={() => hub.set({ sheet: null })} />
      <div className="sheet-scroll">
        {diff.pack.description && <p className="lead">{diff.pack.description}</p>}
        {sections.length === 0 && <Empty icon="Package" title="This pack is empty" />}
        {sections.map((k) => {
          const sec = diff.sections[k]
          const changes = sec.items.filter((i) => i.status !== 'same')
          return (
            <div key={k} className="diff-sec">
              <div className="diff-head">
                <span className="diff-title">{SECTION_LABEL[k]}</span>
                <span className="diff-counts">
                  {(['add', 'update', 'conflict', 'removed', 'same'] as const).map((st) => sec.counts[st] ? <span key={st} className={cx('diff-count', `tone-${STATUS[st].tone}`)} title={STATUS[st].label}><Icon name={STATUS[st].icon} size={11} weight="fill" /><span className="num">{sec.counts[st]}</span></span> : null)}
                </span>
              </div>
              <Segmented full size="s" value={strat[k]} onChange={(v) => setStrat((s) => ({ ...s, [k]: v }))} options={[
                { value: 'merge', label: 'Merge' }, { value: 'overwrite', label: 'Overwrite' }, { value: 'add', label: 'Add new' }, { value: 'replace', label: 'Replace' }, { value: 'skip', label: 'Skip' },
              ]} />
              <p className="field-hint">{STRATEGY_HINT[strat[k]]}</p>
              {changes.length > 0 && (
                <>
                  <button type="button" className="link diff-toggle" onClick={() => setOpen(open === k ? null : k)}>
                    <Icon name={open === k ? 'CaretUp' : 'CaretDown'} size={12} />{open === k ? 'Hide' : 'Show'} {changes.length} change{changes.length === 1 ? '' : 's'}
                  </button>
                  {open === k && (
                    <div className="diff-items">
                      {changes.map((it) => {
                        const on = wants(strat[k], it.status)
                        return (
                          <div key={it.key} className={cx('diff-item', !on && 'is-skipped')}>
                            <span className={cx('diff-dot', `tone-bg-${STATUS[it.status].tone}`)} />
                            <span className="diff-item-main">
                              <span className="diff-item-label">{it.label ?? it.key}</span>
                              <span className="diff-item-key num">{it.key}{it.why ? ` · ${it.why}` : ''}</span>
                            </span>
                            <Badge tone={STATUS[it.status].tone as any}>{STATUS[it.status].label}</Badge>
                            <span className="diff-will">{on ? (it.status === 'removed' ? 'delete' : it.status === 'add' ? 'add' : 'apply') : 'keep'}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
      <footer className="save-bar is-dirty diff-foot">
        <span className="save-bar-note">
          {total === 0 ? 'Nothing to change with these choices.' : plan.filter((p) => p.add + p.upd + p.del).map((p) => `${SECTION_LABEL[p.k]}: ${[p.add && `+${p.add}`, p.upd && `~${p.upd}`, p.del && `−${p.del}`].filter(Boolean).join(' ')}`).join(' · ')}
        </span>
        <Button variant="quiet" size="s" onClick={() => hub.set({ sheet: null })}>Cancel</Button>
        <Button variant="primary" size="s" icon="Check" busy={busy} disabled={total === 0 && !!diff.pack.installed} onClick={apply}>{diff.pack.installed ? 'Apply update' : 'Install'}</Button>
      </footer>
    </div>
  )
}

// Pack export configuration view.
export function ExportSheet({ models: preset }: { models?: string[] }) {
  const models = useApp((s) => s.models)
  const placements = useApp((s) => s.placements)
  const me = useApp((s) => s.me)
  const list = Object.values(models).sort((a, b) => a.label.localeCompare(b.label))
  const first = preset?.length ? models[preset[0]] : undefined
  const [meta, setMeta] = useState({ id: first ? slug(first.model) : 'my_pack', name: first ? first.label : 'My pack', version: '1.0.0', author: '', description: '' })
  const [sel, setSel] = useState<Set<string>>(new Set(preset ?? []))
  const [profiles, setProfiles] = useState(true)
  const [interactions, setInteractions] = useState(true)
  const [where, setWhere] = useState<'none' | 'models' | 'near'>('models')
  const [radius, setRadius] = useState(50)
  const [scenes, setScenes] = useState(true)
  const [result, setResult] = useState<{ text: string; file: string; path?: string; counts: any } | null>(null)
  const [busy, setBusy] = useState(false)
  const placedCount = where === 'none' ? 0 : Object.values(placements).filter((p) => sel.has(p.model) && (where === 'models' || Math.hypot(p.pos.x - me.x, p.pos.y - me.y, p.pos.z - me.z) <= radius)).length

  const run = async () => {
    setBusy(true)
    const res = await rpc('packs:export', {
      ...meta, author: meta.author || undefined, description: meta.description || undefined,
      models: [...sel], profiles, interactions,
      placements: where === 'none' ? 'none' : 'models', near: where === 'near' ? { pos: me, radius } : undefined,
      scenes: scenes ? 'models' : [],
    })
    setBusy(false)
    if (res?.ok) setResult(res)
    else replied(res)
  }

  const copy = () => {
    const ta = document.createElement('textarea')
    ta.value = result!.text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); toast('Pack JSON copied.', 'success') } catch { toast('Copy failed, use the file on the server.', 'error') }
    ta.remove()
  }

  if (result) return (
    <div className="sheet-inner">
      <SheetHead title="Pack exported" sub={<span className="num">{result.file}</span>} back={() => setResult(null)} onClose={() => hub.set({ sheet: null })} />
      <div className="sheet-scroll">
        <div className="callout callout--ok"><Icon name="CheckCircle" size={16} weight="fill" /><span>{result.counts.models} models, {result.counts.placements} placements and {result.counts.scenes} scenes written to the server.</span></div>
        {result.path && <Field label="File on the server"><Input value={result.path} onChange={() => {}} mono /></Field>}
        <Field label="Contents"><pre className="code-preview">{result.text.length > 6000 ? result.text.slice(0, 6000) + '\n…' : result.text}</pre></Field>
      </div>
      <footer className="save-bar is-dirty">
        <span className="save-bar-note">Ship this file with your prop: put it in the prop resource and add <span className="num">osm_propkit_pack 'pack.json'</span> to its fxmanifest.</span>
        <Button variant="primary" size="s" icon="Copy" onClick={copy}>Copy JSON</Button>
      </footer>
    </div>
  )

  return (
    <div className="sheet-inner">
      <SheetHead title="Export a pack" sub="One file your customers load into PropKit" onClose={() => hub.set({ sheet: null })} />
      <div className="sheet-scroll">
        <Section title="Pack">
          <div className="grid-2">
            <Field label="Id" hint="Stays the same across versions"><Input value={meta.id} onChange={(v) => setMeta({ ...meta, id: slug(v) })} mono /></Field>
            <Field label="Version"><Input value={meta.version} onChange={(v) => setMeta({ ...meta, version: v })} mono /></Field>
          </div>
          <div className="grid-2">
            <Field label="Name"><Input value={meta.name} onChange={(v) => setMeta({ ...meta, name: v })} /></Field>
            <Field label="Author"><Input value={meta.author} onChange={(v) => setMeta({ ...meta, author: v })} placeholder="OsmFX" /></Field>
          </div>
          <Field label="Description"><TextArea value={meta.description} onChange={(v) => setMeta({ ...meta, description: v })} rows={2} /></Field>
        </Section>
        <Section title="Models" aside={<span className="section-aside-text num">{sel.size} of {list.length}</span>}>
          <div className="pick-list">
            {list.map((m) => (
              <button type="button" key={m.model} className={cx('pick-item', sel.has(m.model) && 'is-on')} onClick={() => setSel((s) => { const n = new Set(s); if (n.has(m.model)) n.delete(m.model); else n.add(m.model); return n })}>
                <span className={cx('check', sel.has(m.model) && 'is-on')}>{sel.has(m.model) && <Icon name="Check" size={11} weight="fill" />}</span>
                <span className="pick-label">{m.label}</span>
                <span className="pick-hint num">{m.model}</span>
                <span className="pick-hint num">{m.interactions.length} ia</span>
              </button>
            ))}
          </div>
          <div className="switch-list">
            <Switch checked={profiles} onChange={setProfiles} label="Profiles" hint="Label, category, spawn settings" />
            <Switch checked={interactions} onChange={setInteractions} label="Interactions" />
            <Switch checked={scenes} onChange={setScenes} label="Studio scenes" hint="Scenes saved for these models" />
          </div>
        </Section>
        <Section title="Default locations">
          <Segmented full value={where} onChange={setWhere} options={[{ value: 'none', label: 'None' }, { value: 'models', label: 'All of these models' }, { value: 'near', label: 'Near me' }]} />
          {where === 'near' && <Field label="Radius"><Slider value={radius} min={5} max={500} step={5} onChange={setRadius} format={(v) => `${v} m`} /></Field>}
          <p className="field-hint"><span className="num">{placedCount}</span> placement{placedCount === 1 ? '' : 's'} will be included, with exact coordinates and their own interactions.</p>
        </Section>
      </div>
      <footer className="save-bar is-dirty">
        <span className="save-bar-note">Written to <span className="num">exports/{meta.id}-{slug(meta.version)}.json</span></span>
        <Button variant="primary" size="s" icon="Export" busy={busy} disabled={!sel.size || !meta.id} onClick={run}>Export</Button>
      </footer>
    </div>
  )
}
