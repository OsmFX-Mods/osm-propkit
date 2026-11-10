import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '../lib/icons'
import { cx } from '../lib/format'
import { app, toast, useApp } from '../lib/store'

// Button ---------------------------------------------------------------------------------------------------

export function Button({ children, icon, variant = 'ghost', size = 'm', onClick, disabled, busy, kbd, title, className, type, wide }: {
  children?: ReactNode; icon?: IconName; variant?: 'primary' | 'ghost' | 'quiet' | 'danger' | 'solid'; size?: 's' | 'm' | 'l'
  onClick?: () => void; disabled?: boolean; busy?: boolean; kbd?: string; title?: string; className?: string; type?: 'button' | 'submit'; wide?: boolean
}) {
  return (
    <button type={type ?? 'button'} title={title} disabled={disabled || busy} onClick={onClick}
      className={cx('btn group', `btn--${variant}`, `btn--${size}`, wide && 'btn--wide', busy && 'is-busy', !children && 'btn--icon', className)}>
      {busy ? <span className="spinner" /> : icon && <Icon name={icon} size={size === 's' ? 14 : 16} weight={variant === 'primary' ? 'fill' : 'regular'} />}
      {children && <span className="btn-text">{children}</span>}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  )
}

export function IconBtn({ icon, title, onClick, active, tone, size = 'm', disabled, weight }: {
  icon: IconName; title?: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; tone?: 'bad' | 'accent'; size?: 's' | 'm'; disabled?: boolean; weight?: 'regular' | 'fill' | 'duotone'
}) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={cx('ibtn', `ibtn--${size}`, active && 'is-on', tone && `ibtn--${tone}`)}>
      <Icon name={icon} size={size === 's' ? 14 : 16} weight={weight ?? (active ? 'fill' : 'regular')} />
    </button>
  )
}

export function Kbd({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return <kbd className={cx('kbd', dim && 'is-dim')}>{children}</kbd>
}

export function Badge({ children, tone = 'plain', icon }: { children: ReactNode; tone?: 'plain' | 'accent' | 'ok' | 'warn' | 'bad' | 'info'; icon?: IconName }) {
  return <span className={cx('badge', `badge--${tone}`)}>{icon && <Icon name={icon} size={11} weight="fill" />}{children}</span>
}

// Fields ---------------------------------------------------------------------------------------------------

export function Field({ label, hint, children, aside, className }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <label className={cx('field', className)} onClick={(e) => { if ((e.target as HTMLElement).tagName === 'LABEL') e.preventDefault() }}>
      {(label || aside) && <span className="field-head">{label && <span className="field-label">{label}</span>}{aside}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Input({ value, onChange, placeholder, mono, icon, suffix, autoFocus, onEnter, onBlur, maxLength, className, invalid }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; icon?: IconName; suffix?: ReactNode
  autoFocus?: boolean; onEnter?: () => void; onBlur?: () => void; maxLength?: number; className?: string; invalid?: boolean
}) {
  return (
    <span className={cx('input', mono && 'is-mono', invalid && 'is-invalid', className)}>
      {icon && <Icon name={icon} size={15} className="input-icon" />}
      <input value={value} placeholder={placeholder} autoFocus={autoFocus} maxLength={maxLength} spellCheck={false}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && onEnter) onEnter() }} />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </span>
  )
}

export function TextArea({ value, onChange, placeholder, rows = 4, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; mono?: boolean }) {
  return (
    <textarea className={cx('textarea', mono && 'is-mono')} rows={rows} value={value} placeholder={placeholder} spellCheck={false}
      onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
  )
}

// NumberField: type a value, nudge with the arrow keys, or drag the label sideways to scrub it like a dial
export function NumberField({ value, onChange, step = 0.01, min, max, precision = 2, unit, axis, label, onCommit, compact, disabled }: {
  value: number | undefined; onChange: (v: number) => void; step?: number; min?: number; max?: number; precision?: number
  unit?: string; axis?: 'x' | 'y' | 'z'; label?: string; onCommit?: () => void; compact?: boolean; disabled?: boolean
}) {
  const [text, setText] = useState<string | null>(null)
  const scrub = useRef<{ x: number; v: number } | null>(null)
  const clampV = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  const shown = text ?? (value === undefined || !Number.isFinite(value) ? '' : value.toFixed(precision))

  const commit = () => {
    if (text === null) return
    const v = parseFloat(text.replace(',', '.'))
    if (Number.isFinite(v)) onChange(clampV(v))
    setText(null)
    onCommit?.()
  }

  const onScrubDown = (e: React.MouseEvent) => {
    if (disabled || e.button !== 0) return
    e.preventDefault()
    scrub.current = { x: e.clientX, v: value ?? 0 }
    const move = (ev: MouseEvent) => {
      if (!scrub.current) return
      const k = ev.shiftKey ? 0.1 : ev.ctrlKey ? 10 : 1
      const v = scrub.current.v + (ev.clientX - scrub.current.x) * step * k
      onChange(clampV(parseFloat(v.toFixed(precision))))
    }
    const up = () => {
      scrub.current = null
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('is-scrubbing')
      onCommit?.()
    }
    document.body.classList.add('is-scrubbing')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <span className={cx('num-field', axis && `axis-${axis}`, compact && 'is-compact', disabled && 'is-disabled')}>
      {(label || axis) && <span className="num-field-label" onMouseDown={onScrubDown} title="Drag to scrub, Shift for fine, Ctrl for coarse">{label ?? axis!.toUpperCase()}</span>}
      <input className="num" value={shown} disabled={disabled}
        onFocus={(e) => { setText(shown); e.target.select() }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { setText(null); (e.target as HTMLInputElement).blur() }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const k = (e.shiftKey ? 0.1 : e.ctrlKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)
            const v = clampV(parseFloat(((value ?? 0) + step * k).toFixed(precision)))
            onChange(v)
            setText(null)
          }
        }} />
      {unit && <span className="num-field-unit">{unit}</span>}
    </span>
  )
}

export type Opt<T extends string> = { value: T; label: string; icon?: IconName; hint?: string }

export function Select<T extends string>({ value, options, onChange, placeholder }: { value: T | ''; options: Opt<T>[]; onChange: (v: T) => void; placeholder?: string }) {
  return (
    <span className="select">
      <select value={value} onChange={(e) => onChange(e.target.value as T)} onKeyDown={(e) => e.stopPropagation()}>
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="CaretDown" size={13} className="select-caret" />
    </span>
  )
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} className={cx('switch-row', checked && 'is-on')} onClick={() => onChange(!checked)}>
      {label && <span className="switch-text"><span className="switch-label">{label}</span>{hint && <span className="switch-hint">{hint}</span>}</span>}
      <span className="switch"><span className="switch-knob" /></span>
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, size = 'm', full }: { value: T; options: Opt<T>[]; onChange: (v: T) => void; size?: 's' | 'm'; full?: boolean }) {
  return (
    <span className={cx('seg', `seg--${size}`, full && 'seg--full')}>
      {options.map((o) => (
        <button type="button" key={o.value} title={o.hint} className={cx('seg-item', value === o.value && 'is-on')} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={size === 's' ? 13 : 15} weight={value === o.value ? 'fill' : 'regular'} />}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </span>
  )
}

export function Slider({ value, min, max, step = 0.01, onChange, format, onCommit }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; onCommit?: () => void }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <span className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onMouseUp={onCommit}
        style={{ '--pct': `${Math.min(100, Math.max(0, pct))}%` } as CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))} onKeyDown={(e) => e.stopPropagation()} />
      <span className="slider-value num">{format ? format(value) : value.toFixed(step < 1 ? 2 : 0)}</span>
    </span>
  )
}

export function Chip({ children, active, onClick, count, icon }: { children: ReactNode; active?: boolean; onClick?: () => void; count?: number; icon?: IconName }) {
  return (
    <button type="button" className={cx('chip', active && 'is-on')} onClick={onClick}>
      {icon && <Icon name={icon} size={13} weight={active ? 'fill' : 'regular'} />}
      <span>{children}</span>
      {count !== undefined && <span className="chip-count num">{count}</span>}
    </button>
  )
}

// Swatches: preset colours plus a hex field (CEF's native colour picker is unreliable)
const SWATCHES = ['#ffffff', '#ffd9b0', '#ff8a3d', '#ef5350', '#f5b942', '#3ecf8e', '#5aa2ff', '#a78bfa', '#14b8a6', '#1e1e22', '#000000', '#00ff40']
export function ColorField({ value, onChange, swatches = SWATCHES }: { value: string; onChange: (v: string) => void; swatches?: string[] }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <span className="color-field">
      <span className="color-swatches">
        {swatches.map((c) => <button type="button" key={c} title={c} className={cx('swatch', c.toLowerCase() === value?.toLowerCase() && 'is-on')} style={{ background: c }} onClick={() => onChange(c)} />)}
      </span>
      <span className="input is-mono color-hex">
        <span className="color-dot" style={{ background: value }} />
        <input value={text} maxLength={7} onChange={(e) => { setText(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value) }} onKeyDown={(e) => e.stopPropagation()} />
      </span>
    </span>
  )
}

// Combo: free text with suggestions. Used for model names, icons, animations, scenarios
export function Combo({ value, onChange, options, placeholder, mono, icon, onPick, renderOption }: {
  value: string; onChange: (v: string) => void; options: { value: string; label?: string; hint?: string; data?: any }[]
  placeholder?: string; mono?: boolean; icon?: IconName; onPick?: (o: { value: string; label?: string; data?: any }) => void
  renderOption?: (o: { value: string; label?: string; hint?: string; data?: any }) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const q = value.toLowerCase()
  const list = options.filter((o) => !q || o.value.toLowerCase().includes(q) || (o.label ?? '').toLowerCase().includes(q)).slice(0, 40)
  const pick = (o: (typeof list)[number]) => { onChange(o.value); onPick?.(o); setOpen(false) }
  return (
    <span className="combo" onBlur={() => setTimeout(() => setOpen(false), 120)}>
      <span className={cx('input', mono && 'is-mono')}>
        {icon && <Icon name={icon} size={15} className="input-icon" />}
        <input value={value} placeholder={placeholder} spellCheck={false}
          onFocus={() => setOpen(true)}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(0) }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
            if (e.key === 'Enter' && open && list[hi]) { e.preventDefault(); pick(list[hi]) }
            if (e.key === 'Escape') setOpen(false)
          }} />
        <Icon name="CaretDown" size={13} className="input-suffix-icon" />
      </span>
      {open && list.length > 0 && (
        <span className="combo-list">
          {list.map((o, i) => (
            <button type="button" key={o.value + i} className={cx('combo-item', i === hi && 'is-hi')} onMouseDown={(e) => { e.preventDefault(); pick(o) }} onMouseEnter={() => setHi(i)}>
              {renderOption ? renderOption(o) : <>
                <span className={cx('combo-label', mono && !o.label && 'num')}>{o.label ?? o.value}</span>
                {(o.hint || o.label) && <span className="combo-hint num">{o.hint ?? o.value}</span>}
              </>}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

// Menu: a small popover of actions. Rendered in a portal with fixed positioning so scrolling panels never clip it; flips up near the bottom
export function Menu({ trigger, items, align = 'right' }: {
  trigger: (open: () => void, isOpen: boolean) => ReactNode
  items: ({ label: string; icon?: IconName; onClick: () => void; tone?: 'bad'; hint?: string } | 'sep')[]
  align?: 'left' | 'right'
}) {
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const menu = useRef<HTMLSpanElement>(null)
  const open = () => {
    if (pos) return setPos(null)
    const r = ref.current!.getBoundingClientRect()
    const k = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--k')) || 1
    const est = Math.min(420, items.length * 36 + 12) * k
    const below = r.bottom + est + 8 < window.innerHeight
    const p: CSSProperties = {}
    if (below) p.top = (r.bottom + 6) / k
    else p.bottom = (window.innerHeight - r.top + 6) / k
    if (align === 'right') p.right = (window.innerWidth - r.right) / k
    else p.left = r.left / k
    setPos(p)
  }
  useEffect(() => {
    if (!pos) return
    const f = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || menu.current?.contains(t)) return
      setPos(null)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPos(null) } }
    window.addEventListener('mousedown', f)
    window.addEventListener('keydown', esc, true)
    return () => { window.removeEventListener('mousedown', f); window.removeEventListener('keydown', esc, true) }
  }, [pos])
  return (
    <span className="menu-wrap" ref={ref}>
      {trigger(open, !!pos)}
      {pos && createPortal(
        <span className="menu menu--float" ref={menu} style={pos}>
          {items.map((it, i) => it === 'sep' ? <span key={i} className="menu-sep" /> : (
            <button type="button" key={i} className={cx('menu-item', it.tone && `is-${it.tone}`)} onClick={() => { setPos(null); it.onClick() }}>
              {it.icon && <Icon name={it.icon} size={15} />}
              <span className="menu-label">{it.label}</span>
              {it.hint && <span className="menu-hint">{it.hint}</span>}
            </button>
          ))}
        </span>,
        document.getElementById('root')!,
      )}
    </span>
  )
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={26} weight="duotone" className="empty-icon" />
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body">{body}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

export function Section({ title, aside, children, className, sub }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; sub?: ReactNode }) {
  return (
    <section className={cx('section', className)}>
      <header className="section-head">
        <span className="section-title">{title}{sub && <span className="section-sub">{sub}</span>}</span>
        {aside && <span className="section-aside">{aside}</span>}
      </header>
      {children}
    </section>
  )
}

// Confirm: promise-based, so destructive actions read as one line: if (await confirm({...})) remove()
type ConfirmOpts = { title: string; body?: ReactNode; confirm?: string; tone?: 'bad' | 'accent'; icon?: IconName }
let resolveConfirm: ((v: boolean) => void) | null = null
let confirmState: ConfirmOpts | null = null
const confirmSubs = new Set<() => void>()
export function confirm(o: ConfirmOpts): Promise<boolean> {
  confirmState = o
  confirmSubs.forEach((f) => f())
  return new Promise((r) => { resolveConfirm = r })
}
function closeConfirm(v: boolean) {
  resolveConfirm?.(v)
  resolveConfirm = null
  confirmState = null
  confirmSubs.forEach((f) => f())
}

export function ConfirmHost() {
  const [, force] = useState(0)
  useEffect(() => { const f = () => force((n) => n + 1); confirmSubs.add(f); return () => { confirmSubs.delete(f) } }, [])
  useEffect(() => {
    if (!confirmState) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeConfirm(false) }
      if (e.key === 'Enter') { e.stopPropagation(); closeConfirm(true) }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  })
  if (!confirmState) return null
  const o = confirmState
  return createPortal(
    <div className="scrim" onMouseDown={() => closeConfirm(false)}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          {o.icon && <Icon name={o.icon} size={20} weight="duotone" className={cx('dialog-icon', o.tone === 'bad' && 'tone-bad')} />}
          <span className="dialog-title">{o.title}</span>
        </div>
        {o.body && <div className="dialog-body">{o.body}</div>}
        <div className="dialog-actions">
          <Button variant="quiet" onClick={() => closeConfirm(false)} kbd="Esc">Cancel</Button>
          <Button variant={o.tone === 'bad' ? 'danger' : 'primary'} onClick={() => closeConfirm(true)} kbd="↵">{o.confirm ?? 'Confirm'}</Button>
        </div>
      </div>
    </div>,
    document.getElementById('root')!,
  )
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const ICON = { info: 'Info', success: 'CheckCircle', error: 'WarningCircle', warning: 'Warning' } as const
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={cx('toast', `toast--${t.kind}`)} onClick={() => app.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }))}>
          <Icon name={ICON[t.kind]} size={17} weight="fill" className="toast-icon" />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}

// Copy text: the clipboard API is blocked in FiveM's NUI (permissions policy), the old execCommand path still works for text
export function copyText(text: string, done = 'Copied.') {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  ta.remove()
  if (ok) toast(done, 'success')
  else toast('Copy failed. Select the text and press Ctrl+C.', 'error')
  return ok
}

export function Spinner() { return <span className="spinner" /> }
