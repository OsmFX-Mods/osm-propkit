import { useEffect, useMemo } from 'react'
import { fetchNui } from '../lib/nui'
import { useApp } from '../lib/store'
import { Icon } from '../lib/icons'
import { Button, IconBtn, Kbd } from '../kit/ui'
import { cx } from '../lib/format'
import { hub, useHub } from './state'
import { Library } from './Library'
import { Placed } from './Placed'
import { Packs } from './Packs'
import { ModelSheet } from './ModelSheet'
import { PlacementSheet } from './PlacementSheet'
import { ImportSheet, DiffSheet, ExportSheet } from './PackSheets'
import { InteractionEditor } from './InteractionEditor'

const TARGET_LABEL: Record<string, string> = { osm: 'osm-target', ox: 'ox_target', qb: 'qb-target', none: 'no target script' }

// PropKit logo mark.
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="mark" aria-hidden>
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3.8 7.2 12 11.6l8.2-4.4M12 11.6v9.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" opacity=".55" />
      <circle cx="12" cy="11.6" r="2.4" fill="var(--accent)" />
    </svg>
  )
}

export function close() {
  fetchNui('hub:highlight', { id: null })
  fetchNui('close')
}

export function Hub() {
  const section = useHub((v) => v.section)
  const sheet = useHub((v) => v.sheet)
  const draft = useHub((v) => v.draft)
  const models = useApp((s) => s.models)
  const placements = useApp((s) => s.placements)
  const boot = useApp((s) => s.boot)
  const perms = useApp((s) => s.perms)
  const screenData = useApp((s) => s.screenData)

  // Restores previous view state when returning from world editor.
  useEffect(() => {
    const v = screenData?.view
    if (v && typeof v === 'object') hub.set(v)
  }, [screenData])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const v = hub.get()
      if (v.draft) {
        if (!v.draft.dirty) hub.set({ draft: null })
        return
      }
      if (v.sheet) return hub.set({ sheet: null })
      close()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const counts = useMemo(() => ({ models: Object.keys(models).length, placed: Object.keys(placements).length }), [models, placements])
  const wide = sheet?.kind === 'diff' || sheet?.kind === 'export' || !!draft

  return (
    <div className="hub ui-scale">
      <aside className="dock">
        <header className="dock-head">
          <span className="brand"><Mark /><span className="brand-name">PropKit</span></span>
          <span className="dock-head-actions">
            {perms.studio && <Button size="s" variant="solid" icon="Aperture" onClick={() => fetchNui('hub:studio', {})}>Studio</Button>}
            <IconBtn icon="X" title="Close (Esc)" onClick={close} />
          </span>
        </header>
        <nav className="dock-tabs">
          {([
            ['library', 'Library', 'SquaresFour', counts.models],
            ['placed', 'Placed', 'MapPinLine', counts.placed],
            ['packs', 'Packs', 'Stack', undefined],
          ] as const).map(([id, label, icon, n]) => (
            <button key={id} type="button" className={cx('dock-tab', section === id && 'is-on')} onClick={() => hub.set({ section: id })}>
              <Icon name={icon} size={16} weight={section === id ? 'fill' : 'regular'} />
              <span>{label}</span>
              {n !== undefined && <span className="dock-tab-count num">{n}</span>}
            </button>
          ))}
        </nav>
        <div className="dock-body">
          {section === 'library' && <Library />}
          {section === 'placed' && <Placed />}
          {section === 'packs' && <Packs />}
        </div>
        <footer className="dock-foot">
          <span className={cx('status-dot', boot?.target === 'none' ? 'is-bad' : 'is-ok')} />
          <span>{TARGET_LABEL[boot?.target ?? 'none']}</span>
          <span className="dot-sep" />
          <span>{boot?.framework ?? '…'}</span>
          <span className="dock-foot-keys"><Kbd dim>Esc</Kbd> close</span>
        </footer>
      </aside>
      {sheet && (
        <aside className={cx('sheet', wide && 'sheet--wide')} key={sheet.kind + ('model' in sheet ? sheet.model : '') + ('id' in sheet ? sheet.id : '')}>
          {draft ? <InteractionEditor /> : <>
            {sheet.kind === 'model' && <ModelSheet model={sheet.model} tab={sheet.tab} />}
            {sheet.kind === 'placement' && <PlacementSheet id={sheet.id} tab={sheet.tab} />}
            {sheet.kind === 'import' && <ImportSheet />}
            {sheet.kind === 'diff' && <DiffSheet token={sheet.token} />}
            {sheet.kind === 'export' && <ExportSheet models={sheet.models} />}
          </>}
        </aside>
      )}
    </div>
  )
}
