export const fmtNum = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function fmtDist(m: number) {
  if (!Number.isFinite(m)) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`
}

export function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function fmtAgo(ts?: number) {
  if (!ts) return ''
  const s = Math.floor(Date.now() / 1000 - ts)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export function fmtMs(ms: number) {
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  return s % 1 === 0 ? `${s} s` : `${s.toFixed(1)} s`
}

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export function slug(s: string) {
  return s.toLowerCase().replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'item'
}

export function uid(prefix = 'it') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
