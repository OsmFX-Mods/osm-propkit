import { useEffect, useState } from 'react'
import { rpc } from '../lib/nui'
import { replied, useApp } from '../lib/store'
import { Icon } from '../lib/icons'
import { Badge, Button, Empty, IconBtn, Menu, Spinner, Switch, confirm } from '../kit/ui'
import { cx, fmtAgo } from '../lib/format'
import type { PackEntry } from '../lib/types'
import { hub } from './state'

let cache: { installed: PackEntry[]; available: PackEntry[] } | null = null

export async function stage(args: { text?: string; source?: string }) {
  const d = await rpc('packs:stage', args)
  if (!d?.ok) return replied(d)
  diffCache[d.token] = d
  hub.set({ sheet: { kind: 'diff', token: d.token } })
  return true
}
export const diffCache: Record<string, any> = {}

const STATUS: Record<string, { label: string; tone: 'accent' | 'ok' | 'plain' | 'bad' | 'warn' }> = {
  new: { label: 'New', tone: 'accent' }, update: { label: 'Update', tone: 'accent' }, installed: { label: 'Installed', tone: 'ok' },
  older: { label: 'Older file', tone: 'plain' }, invalid: { label: 'Invalid', tone: 'bad' },
}

export function Packs() {
  const perms = useApp((s) => s.perms)
  const [data, setData] = useState(cache)
  const [busy, setBusy] = useState<string | null>(null)
  const load = async () => {
    const r = await rpc('packs:list')
    if (r?.ok) { cache = { installed: r.installed, available: r.available }; setData(cache) }
  }
  useEffect(() => { if (perms.packs) load() }, [perms.packs])

  if (!perms.packs) return <div className="pane"><Empty icon="Lock" title="Packs need extra rights" body="Ask for the osm-propkit.packs permission to install or export packs." /></div>

  const review = async (source: string) => { setBusy(source); await stage({ source }); setBusy(null) }
  const pending = (data?.available ?? []).filter((a) => a.status === 'new' || a.status === 'update' || a.status === 'invalid')
  const rest = (data?.available ?? []).filter((a) => !pending.includes(a))

  const uninstall = async (p: PackEntry) => {
    let keep = true
    const ok = await confirm({
      title: `Uninstall ${p.name}?`, tone: 'bad', icon: 'Trash', confirm: 'Uninstall',
      body: <div className="stack-s"><span>Removes the models, placements and scenes this pack added.</span><KeepToggle onChange={(v) => { keep = v }} /></div>,
    })
    if (!ok) return
    if (replied(await rpc('packs:uninstall', { id: p.id, keepEdited: keep }), 'Pack uninstalled.')) load()
  }

  return (
    <div className="pane">
      <div className="pane-tools">
        <Button icon="UploadSimple" variant="ghost" onClick={() => hub.set({ sheet: { kind: 'import' } })}>Import JSON</Button>
        <Button icon="Export" variant="ghost" onClick={() => hub.set({ sheet: { kind: 'export' } })}>Export</Button>
        <span className="flex-1" />
        <IconBtn icon="ArrowsClockwise" title="Look for packs again" onClick={load} />
      </div>
      <div className="pane-scroll">
        {!data ? <div className="loading"><Spinner /></div> : <>
          {pending.length > 0 && (
            <div className="pack-group">
              <div className="group-head"><Icon name="Sparkle" size={13} /><span>Ready to install</span><span className="num group-count">{pending.length}</span></div>
              {pending.map((a) => (
                <div key={a.source} className={cx('pack-row', a.status === 'invalid' && 'is-bad')}>
                  <span className="pack-icon"><Icon name={a.status === 'invalid' ? 'WarningCircle' : 'Package'} size={20} weight="duotone" /></span>
                  <span className="pack-main">
                    <span className="pack-title">{a.name ?? a.label}{a.version && <span className="num pack-ver">{a.installed ? `${a.installed} → ${a.version}` : a.version}</span>}</span>
                    <span className="pack-meta">{a.status === 'invalid' ? <span className="tone-bad">{a.error}</span> : <>
                      <span className="num">{a.label}</span>
                      {a.counts && <><span className="dot-sep" /><span>{a.counts.models} models · {a.counts.interactions ?? 0} interactions · {a.counts.placements} placements</span></>}
                    </>}</span>
                  </span>
                  <Badge tone={STATUS[a.status ?? 'new'].tone}>{STATUS[a.status ?? 'new'].label}</Badge>
                  {a.status !== 'invalid' && <Button size="s" variant="primary" busy={busy === a.source} onClick={() => review(a.source!)}>Review</Button>}
                </div>
              ))}
            </div>
          )}
          <div className="pack-group">
            <div className="group-head"><Icon name="CheckCircle" size={13} /><span>Installed</span><span className="num group-count">{data.installed.length}</span></div>
            {data.installed.length === 0
              ? <Empty icon="Stack" title="No packs installed" body="Drop a pack's .json into this resource's packs folder, ensure a prop resource that ships one, or paste the JSON with Import." />
              : data.installed.map((p) => (
                <div key={p.id} className="pack-row">
                  <span className="pack-icon is-installed"><Icon name="Package" size={20} weight="duotone" /></span>
                  <span className="pack-main">
                    <span className="pack-title">{p.name}<span className="num pack-ver">{p.version}</span></span>
                    <span className="pack-meta">
                      {p.author && <><span>{p.author}</span><span className="dot-sep" /></>}
                      <span>{p.counts?.models ?? 0} models · {p.counts?.placements ?? 0} placements</span>
                      {!!p.counts?.modified && <><span className="dot-sep" /><span className="tone-warn">{p.counts.modified} edited here</span></>}
                      {p.installed && <><span className="dot-sep" /><span>{fmtAgo(Number(p.installed))}</span></>}
                    </span>
                  </span>
                  <Menu trigger={(open) => <IconBtn size="s" icon="DotsThree" onClick={open} />} items={[
                    ...(rest.find((r) => r.id === p.id)?.source ? [{ label: 'Reinstall from file', icon: 'ArrowsClockwise' as const, onClick: () => review(rest.find((r) => r.id === p.id)!.source!) }] : []),
                    { label: 'Export current state', icon: 'Export', onClick: () => hub.set({ sheet: { kind: 'export' } }) },
                    'sep',
                    { label: 'Uninstall', icon: 'Trash', tone: 'bad', onClick: () => uninstall(p) },
                  ]} />
                </div>
              ))}
          </div>
        </>}
      </div>
    </div>
  )
}

function KeepToggle({ onChange }: { onChange: (v: boolean) => void }) {
  const [v, setV] = useState(true)
  return <Switch checked={v} onChange={(x) => { setV(x); onChange(x) }} label="Keep what I edited" hint="Edited items stay, detached from the pack" />
}

export function reloadPacks() { cache = null }
