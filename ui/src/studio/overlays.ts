import { project, type CamFrame } from '../lib/math'
import type { Overlay } from './scene'

// Overlays: text, logos and interaction callouts composited on top of the shot. The live preview and the export both draw with
// this one function, so what you line up in the frame is exactly what lands in the file. Sizes are fractions of the frame height.

export type Box = { id: string; x: number; y: number; w: number; h: number }
type Rect = { x: number; y: number; w: number; h: number }

const FONT = "'Plus Jakarta Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const MARK_SVG = (fg: string, accent: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="240" height="240">
<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7Z" fill="none" stroke="${fg}" stroke-width="1.7" stroke-linejoin="round"/>
<path d="M3.8 7.2 12 11.6l8.2-4.4M12 11.6v9.6" fill="none" stroke="${fg}" stroke-width="1.7" stroke-linejoin="round" opacity=".55"/>
<circle cx="12" cy="11.6" r="2.4" fill="${accent}"/></svg>`

const imgCache = new Map<string, Promise<HTMLImageElement | null>>()
function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((res) => {
      const im = new Image()
      im.crossOrigin = 'anonymous'
      im.onload = () => res(im)
      im.onerror = () => res(null)
      im.src = src
    }))
  }
  return imgCache.get(src)!
}
const markImage = () => loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(MARK_SVG('#f4f4f0', '#ff8a3d')))

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function trackedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  if (!tracking) { ctx.fillText(text, x, y); return }
  // Canvas letterSpacing is not in old CEF; draw glyph by glyph
  const align = ctx.textAlign
  const widths = [...text].map((ch) => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  ctx.textAlign = 'left'
  ;[...text].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + tracking })
  ctx.textAlign = align
}

export async function drawOverlays(ctx: CanvasRenderingContext2D, overlays: Overlay[], size: { w: number; h: number }, rect: Rect, cam: CamFrame, selected?: string): Promise<Box[]> {
  const { w: W, h: H } = size
  const boxes: Box[] = []
  const screen = { w: window.innerWidth, h: window.innerHeight }
  const mark = overlays.some((o) => o.kind === 'logo' && o.src === 'osmfx') ? await markImage() : null

  for (const o of overlays) {
    if (o.kind === 'text') {
      const px = o.size * H
      ctx.font = `${o.weight} ${px}px ${o.mono ? MONO : FONT}`
      ctx.textAlign = o.align
      ctx.textBaseline = 'alphabetic'
      const lines = (o.upper ? o.text.toUpperCase() : o.text).split('\n')
      const lh = px * 1.12
      const track = (o.tracking ?? 0) * px
      const widths = lines.map((l) => ctx.measureText(l).width + track * Math.max(0, l.length - 1))
      const bw = Math.max(...widths, 1)
      const x = o.x * W, y = o.y * H
      const left = o.align === 'center' ? x - bw / 2 : o.align === 'right' ? x - bw : x
      const top = y - px * 0.9
      const bh = lh * (lines.length - 1) + px * 1.15
      if (o.plate) {
        const pad = px * 0.42
        ctx.fillStyle = 'rgba(10,10,12,0.62)'
        roundRect(ctx, left - pad, top - pad * 0.7, bw + pad * 2, bh + pad * 1.2, px * 0.3)
        ctx.fill()
      }
      ctx.fillStyle = o.color
      ctx.shadowColor = o.plate ? 'transparent' : 'rgba(0,0,0,0.35)'
      ctx.shadowBlur = o.plate ? 0 : px * 0.25
      lines.forEach((l, i) => trackedText(ctx, l, x, y + i * lh, track))
      ctx.shadowBlur = 0
      boxes.push({ id: o.id, x: left, y: top, w: bw, h: bh })
    } else if (o.kind === 'logo') {
      const h = o.size * H
      ctx.globalAlpha = o.opacity
      if (o.src === 'osmfx') {
        if (mark) ctx.drawImage(mark, o.x * W, o.y * H, h, h)
        ctx.font = `800 ${h * 0.5}px ${FONT}`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#f4f4f0'
        ctx.fillText('OsmFX', o.x * W + h * 1.12, o.y * H + h * 0.52)
        const tw = ctx.measureText('OsmFX').width
        boxes.push({ id: o.id, x: o.x * W, y: o.y * H, w: h * 1.12 + tw, h })
      } else {
        const im = await loadImage(o.src)
        if (im) {
          const w = (im.width / im.height) * h
          ctx.drawImage(im, o.x * W, o.y * H, w, h)
          boxes.push({ id: o.id, x: o.x * W, y: o.y * H, w, h })
        }
      }
      ctx.globalAlpha = 1
    } else if (o.kind === 'callout') {
      const s = project(o.point, cam, screen)
      if (!s) continue
      const fx = ((s.x - rect.x) / rect.w) * W, fy = ((s.y - rect.y) / rect.h) * H
      const u = H * 0.026
      const side = o.side === 'auto' ? (fx < W * 0.55 ? 1 : -1) : o.side === 'right' ? 1 : -1
      const ex = fx + side * u * 3.2, ey = fy - u * 2.2
      // Target ring on the prop
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = Math.max(1.5, u * 0.12)
      ctx.beginPath(); ctx.arc(fx, fy, u * 0.55, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#ff8a3d'
      ctx.beginPath(); ctx.arc(fx, fy, u * 0.22, 0, Math.PI * 2); ctx.fill()
      // Leader
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.beginPath(); ctx.moveTo(fx + side * u * 0.55 * 0.7, fy - u * 0.55 * 0.7); ctx.lineTo(ex, ey); ctx.stroke()
      // Card
      ctx.font = `700 ${u}px ${FONT}`
      const lw = ctx.measureText(o.label).width
      ctx.font = `500 ${u * 0.72}px ${FONT}`
      const sw = o.sub ? ctx.measureText(o.sub).width : 0
      const key = o.key ?? 'E'
      const kw = key ? u * 1.5 : 0
      const pad = u * 0.6
      const cw = pad * 2 + kw + (key ? u * 0.55 : 0) + Math.max(lw, sw)
      const ch = o.sub ? u * 2.55 : u * 1.9
      const cx = side === 1 ? ex : ex - cw
      const cy = ey - ch / 2
      ctx.fillStyle = 'rgba(14,14,16,0.88)'
      roundRect(ctx, cx, cy, cw, ch, u * 0.42); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.stroke()
      let tx = cx + pad
      if (key) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)'
        roundRect(ctx, tx, ey - u * 0.72, kw, u * 1.44, u * 0.3); ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.stroke()
        ctx.fillStyle = '#f4f4f0'
        ctx.font = `700 ${u * 0.8}px ${MONO}`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(key, tx + kw / 2, ey + u * 0.02)
        tx += kw + u * 0.55
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = '#f4f4f0'
      ctx.font = `700 ${u}px ${FONT}`
      ctx.fillText(o.label, tx, o.sub ? ey - u * 0.08 : ey + u * 0.36)
      if (o.sub) {
        ctx.fillStyle = 'rgba(244,244,240,0.62)'
        ctx.font = `500 ${u * 0.72}px ${FONT}`
        ctx.fillText(o.sub, tx, ey + u * 0.82)
      }
      boxes.push({ id: o.id, x: cx, y: cy, w: cw, h: ch })
    }
    if (selected === o.id) {
      const b = boxes[boxes.length - 1]
      if (b && b.id === o.id) {
        ctx.setLineDash([5, 4])
        ctx.strokeStyle = '#ff8a3d'
        ctx.lineWidth = 1.5
        ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12)
        ctx.setLineDash([])
      }
    }
  }
  return boxes
}
