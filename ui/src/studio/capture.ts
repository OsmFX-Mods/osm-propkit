import { fetchNui, isEnvBrowser, onNui } from '../lib/nui'
import type { CamFrame } from '../lib/math'
import type { Output, Overlay, Scene } from './scene'
import { drawOverlays } from './overlays'

// Reads the game frame via FiveM CEF game-view texture hook for clean studio captures.

const VERT = `attribute vec2 a_position; attribute vec2 a_texcoord; varying vec2 v; void main(){ gl_Position = vec4(a_position, 0.0, 1.0); v = a_texcoord; }`
const FRAG = `varying highp vec2 v; uniform sampler2D t; void main(){ gl_FragColor = texture2D(t, v); }`

class GameView {
  canvas = document.createElement('canvas')
  gl: WebGLRenderingContext
  constructor() {
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
    const gl = this.canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, preserveDrawingBuffer: true })!
    this.gl = gl
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]))
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // Sets texture wrap parameters for FiveM back buffer binding.
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const vb = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vb)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const vl = gl.getAttribLocation(prog, 'a_position')
    gl.vertexAttribPointer(vl, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(vl)
    const tb = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, tb)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    const tl = gl.getAttribLocation(prog, 'a_texcoord')
    gl.vertexAttribPointer(tl, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(tl)
    gl.uniform1i(gl.getUniformLocation(prog, 't'), 0)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  }
  draw() {
    const gl = this.gl
    if (this.canvas.width !== window.innerWidth || this.canvas.height !== window.innerHeight) {
      this.canvas.width = window.innerWidth
      this.canvas.height = window.innerHeight
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.finish()
    return this.canvas
  }
  dispose() { this.gl.getExtension('WEBGL_lose_context')?.loseContext() }
}

let view: GameView | null = null
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Dev mode canvas fallback for browser development.
function source(): HTMLCanvasElement {
  if (isEnvBrowser) return (window as any).__devFrame?.() ?? document.createElement('canvas')
  if (!view) view = new GameView()
  return view.draw()
}

export function releaseGameView() { view?.dispose(); view = null }

export type Rect = { x: number; y: number; w: number; h: number }

// Captures and averages multiple consecutive frames to reduce temporal shimmer.
async function grab(rect: Rect, frames: number): Promise<ImageData> {
  const c = document.createElement('canvas')
  c.width = rect.w; c.height = rect.h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  if (frames <= 1) {
    await nextFrame()
    ctx.drawImage(source(), rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)
    return ctx.getImageData(0, 0, rect.w, rect.h)
  }
  const acc = new Float32Array(rect.w * rect.h * 4)
  for (let f = 0; f < frames; f++) {
    await nextFrame()
    ctx.drawImage(source(), rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)
    const d = ctx.getImageData(0, 0, rect.w, rect.h).data
    for (let i = 0; i < d.length; i++) acc[i] += d[i]
  }
  const out = ctx.createImageData(rect.w, rect.h)
  for (let i = 0; i < acc.length; i++) out.data[i] = acc[i] / frames
  return out
}

// Samples rendered backdrop colors from frame edges for matte calculation.
function cornerMean(img: ImageData) {
  const { width: w, height: h, data } = img
  const s = Math.max(4, Math.floor(Math.min(w, h) * 0.02))
  let r = 0, g = 0, b = 0, n = 0
  for (const [x0, y0] of [[0, 0], [w - s, 0], [0, h - s], [w - s, h - s]]) {
    for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) {
      const i = (y * w + x) * 4
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
    }
  }
  return [r / n, g / n, b / n]
}

// Computes transparent alpha matte using difference between black and white backdrops.
function differenceMatte(black: ImageData, white: ImageData): ImageData {
  const k = cornerMean(black), w = cornerMean(white)
  const span = [Math.max(1, w[0] - k[0]), Math.max(1, w[1] - k[1]), Math.max(1, w[2] - k[2])]
  const out = new ImageData(black.width, black.height)
  const a = black.data, b = white.data, o = out.data
  for (let i = 0; i < a.length; i += 4) {
    const t = ((b[i] - a[i]) / span[0] + (b[i + 1] - a[i + 1]) / span[1] + (b[i + 2] - a[i + 2]) / span[2]) / 3
    const alpha = Math.min(1, Math.max(0, 1 - t))
    if (alpha < 0.004) { o[i + 3] = 0; continue }
    // Un-premultiplies color against black backdrop baseline.
    o[i] = Math.min(255, Math.max(0, (a[i] - k[0] * (1 - alpha)) / alpha))
    o[i + 1] = Math.min(255, Math.max(0, (a[i + 1] - k[1] * (1 - alpha)) / alpha))
    o[i + 2] = Math.min(255, Math.max(0, (a[i + 2] - k[2] * (1 - alpha)) / alpha))
    o[i + 3] = Math.round(alpha * 255)
  }
  return out
}

// Distance-based chroma key with edge-aware spill suppression.
function chromaKey(img: ImageData, key: Output['key']): ImageData {
  const [kr, kg, kb] = cornerMean(img)
  const out = new ImageData(img.width, img.height)
  const d = img.data, o = out.data
  const t1 = key.tol * 441, t2 = (key.tol + key.soft) * 441
  const greenish = kg > kr && kg > kb
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const dist = Math.sqrt((r - kr) * (r - kr) + (g - kg) * (g - kg) + (b - kb) * (b - kb))
    const alpha = dist <= t1 ? 0 : dist >= t2 ? 1 : (dist - t1) / (t2 - t1)
    let nr = r, ng = g, nb = b
    if (alpha > 0 && alpha < 1 && key.spill > 0) {
      if (greenish) { const lim = Math.max(r, b); if (g > lim) ng = g - (g - lim) * key.spill }
      else { const lim = Math.max(r, g); if (b > lim) nb = b - (b - lim) * key.spill }
    }
    o[i] = nr; o[i + 1] = ng; o[i + 2] = nb; o[i + 3] = Math.round(alpha * 255)
  }
  return out
}
export const _chromaKey = chromaKey

export type ShotResult = { dataUrl: string; thumb: string; width: number; height: number; ext: string; blobUrl: string }

// Full photo capture and compositing pipeline.
export async function shoot(scene: Scene, rect: Rect, cam: CamFrame, onPhase?: (p: string) => void): Promise<ShotResult> {
  const o = scene.output
  let img: ImageData
  const transparent = o.matte !== 'none' && o.format !== 'jpg'
  if (o.matte === 'clean') {
    onPhase?.('Black pass')
    await fetchNui('studio:matte', { mode: 'black' })
    await wait(140)
    const black = await grab(rect, o.frames)
    onPhase?.('White pass')
    await fetchNui('studio:matte', { mode: 'white' })
    await wait(140)
    const white = await grab(rect, o.frames)
    await fetchNui('studio:matte', { mode: null })
    img = differenceMatte(black, white)
  } else if (o.matte === 'chroma') {
    onPhase?.('Keying')
    await fetchNui('studio:matte', { mode: 'chroma' })
    await wait(140)
    const raw = await grab(rect, o.frames)
    await fetchNui('studio:matte', { mode: null })
    img = chromaKey(raw, o.key)
  } else {
    onPhase?.('Capturing')
    img = await grab(rect, o.frames)
  }

  onPhase?.('Finishing')
  const outW = o.width > 0 ? Math.min(o.width, rect.w * 2) : rect.w
  const outH = Math.round((outW / rect.w) * rect.h)
  const base = document.createElement('canvas')
  base.width = rect.w; base.height = rect.h
  base.getContext('2d')!.putImageData(img, 0, 0)

  const out = document.createElement('canvas')
  out.width = outW; out.height = outH
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  if (!transparent && o.format === 'jpg') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, outW, outH) }
  const filters: string[] = []
  if (o.exposure !== 1) filters.push(`brightness(${o.exposure})`)
  if (o.contrast !== 1) filters.push(`contrast(${o.contrast})`)
  if (o.saturation !== 1) filters.push(`saturate(${o.saturation})`)
  if (filters.length) ctx.filter = filters.join(' ')
  ctx.drawImage(base, 0, 0, outW, outH)
  ctx.filter = 'none'
  if (o.vignette > 0 && !transparent) {
    const g = ctx.createRadialGradient(outW / 2, outH / 2, Math.min(outW, outH) * 0.35, outW / 2, outH / 2, Math.hypot(outW, outH) / 2)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${o.vignette})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, outW, outH)
  }
  await drawOverlays(ctx, scene.overlays as Overlay[], { w: outW, h: outH }, rect, cam)

  const ext = o.format
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  const dataUrl = out.toDataURL(mime, o.quality)
  const tw = 360, th = Math.round((tw / outW) * outH)
  const t = document.createElement('canvas')
  t.width = tw; t.height = th
  t.getContext('2d')!.drawImage(out, 0, 0, tw, th)
  const thumb = t.toDataURL('image/webp', 0.82)
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, mime, o.quality))
  return { dataUrl, thumb, width: outW, height: outH, ext, blobUrl: blob ? URL.createObjectURL(blob) : dataUrl }
}

// Chunks and transmits base64 image data to server via latent NUI events.
export async function upload(r: ShotResult, meta: { name: string; model?: string; scene?: string }, onProgress?: (p: number) => void) {
  const data = r.dataUrl.replace(/^data:[^;]+;base64,/, '')
  const size = 480 * 1024
  const chunks = Math.ceil(data.length / size)
  const begin = await fetchNui('studio:upload:begin', { chunks, size: data.length, ext: r.ext, width: r.width, height: r.height, name: meta.name, model: meta.model, scene: meta.scene, thumb: r.thumb })
  if (!begin?.ok) throw new Error(begin?.msg || 'The server refused the image.')
  const done = new Promise<any>((resolve) => {
    const off = onNui('studio:shot', (d) => { if (d.id === begin.id) { off(); resolve(d) } })
    setTimeout(() => { off(); resolve({ ok: false, msg: 'The server did not answer in time.' }) }, 120000)
  })
  for (let i = 0; i < chunks; i++) {
    await fetchNui('studio:upload:chunk', { id: begin.id, i: i + 1, data: data.slice(i * size, (i + 1) * size) })
    onProgress?.((i + 1) / chunks)
  }
  return done
}

// Copies rendered capture to system clipboard.
export async function copyImage(blobUrl: string) {
  const blob = await (await fetch(blobUrl)).blob()
  const png = blob.type === 'image/png' ? blob : await toPng(blob)
  const CI = (window as any).ClipboardItem
  if (!CI || !navigator.clipboard?.write) throw new Error('Clipboard images are not available here.')
  await navigator.clipboard.write([new CI({ 'image/png': png })])
}

async function toPng(b: Blob): Promise<Blob> {
  const img = await createImageBitmap(b)
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  c.getContext('2d')!.drawImage(img, 0, 0)
  return new Promise((r) => c.toBlob((x) => r(x!), 'image/png'))
}

// Record: the cropped frame as WebM while a camera path plays (experimental, depends on the CEF build having MediaRecorder)
export function canRecord() { return typeof (window as any).MediaRecorder !== 'undefined' }

export function startRecording(rect: Rect, fps = 30) {
  const c = document.createElement('canvas')
  c.width = rect.w; c.height = rect.h
  const ctx = c.getContext('2d')!
  let on = true
  const loop = () => { if (!on) return; ctx.drawImage(source(), rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h); requestAnimationFrame(loop) }
  loop()
  const stream = (c as any).captureStream(fps) as MediaStream
  const MR = (window as any).MediaRecorder
  const type = MR.isTypeSupported?.('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
  const rec = new MR(stream, { mimeType: type, videoBitsPerSecond: 12_000_000 })
  const parts: Blob[] = []
  rec.ondataavailable = (e: any) => { if (e.data?.size) parts.push(e.data) }
  rec.start(500)
  return {
    stop: () => new Promise<{ dataUrl: string; blobUrl: string; width: number; height: number }>((resolve) => {
      rec.onstop = async () => {
        on = false
        const blob = new Blob(parts, { type: 'video/webm' })
        const dataUrl = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob) })
        resolve({ dataUrl, blobUrl: URL.createObjectURL(blob), width: rect.w, height: rect.h })
      }
      rec.stop()
    }),
  }
}
