import type { V3 } from '../lib/math'
import { kelvin, hex, add, sub } from '../lib/math'
import { uid } from '../lib/format'

// Studio scene definition serialized relative to stage origin.

export type Anim = { dict?: string; clip?: string; flag?: number; scenario?: string }
type Base = { id: string; name: string; visible: boolean; pos: V3; rot: V3 }
export type PropItem = Base & { kind: 'prop'; model: string; subject?: boolean; alpha?: number }
export type PedItem = Base & { kind: 'ped'; model?: string; clone?: boolean; anim?: Anim; scenario?: string }
export type LightItem = Base & { kind: 'light'; type: 'spot' | 'point'; kelvin: number; tint?: string; color: string; intensity: number; range: number; angle: number; softness: number; falloff?: number; shadow: boolean; aim: boolean }
export type FxItem = Base & { kind: 'fx'; asset: string; effect: string; scale: number; color?: string }
export type BoardItem = Base & { kind: 'board'; size: { w: number; h: number }; board: Board; alpha?: number }
export type Item = PropItem | PedItem | LightItem | FxItem | BoardItem
export type Board = { bg: string; bg2: string; title: string; sub: string; logo: boolean; image?: string; align: 'left' | 'center'; accent: string }

export type Overlay =
  | { id: string; kind: 'text'; text: string; x: number; y: number; size: number; weight: number; color: string; align: 'left' | 'center' | 'right'; upper?: boolean; tracking?: number; plate?: boolean; mono?: boolean }
  | { id: string; kind: 'logo'; src: 'osmfx' | string; x: number; y: number; size: number; opacity: number }
  | { id: string; kind: 'callout'; item?: string; point: V3; label: string; sub?: string; key?: string; side: 'auto' | 'left' | 'right'; icon?: string }

export type Shot = { id: string; name: string; pos: V3; rot: V3; fov: number }
export type Key = { id: string; t: number; pos: V3; rot: V3; fov: number; ease?: 'smooth' | 'linear' }

export type Output = {
  aspect: string; format: 'png' | 'webp' | 'jpg'; quality: number; width: number; matte: 'none' | 'clean' | 'chroma'
  frames: number; exposure: number; contrast: number; saturation: number; vignette: number; key: { tol: number; soft: number; spill: number }
}

export type Scene = {
  id?: string; name: string; model?: string
  stage: { mode: 'here' | 'void'; origin: V3 }
  env: { time: { h: number; m: number }; weather: string; look: { name: string; strength: number }; lodScale: number; parkPed: boolean }
  backdrop: { mode: 'none' | 'sweep' | 'chroma'; top: string; bottom: string; chroma: string; size: number; height: number; floor: boolean }
  camera: { fov: number; roll: number; dof: { on: boolean; focus: number; range: number; strength: number } }
  items: Item[]
  shots: Shot[]
  keys: Key[]
  overlays: Overlay[]
  output: Output
  guides: 'none' | 'thirds' | 'center' | 'golden'
}

export const ASPECTS: { id: string; label: string; ratio: number | null; hint: string }[] = [
  { id: 'free', label: 'Screen', ratio: null, hint: 'The full game frame' },
  { id: '1:1', label: '1:1', ratio: 1, hint: 'Store tiles, Discord embeds' },
  { id: '4:5', label: '4:5', ratio: 4 / 5, hint: 'Instagram portrait' },
  { id: '16:9', label: '16:9', ratio: 16 / 9, hint: 'Banners, YouTube' },
  { id: '9:16', label: '9:16', ratio: 9 / 16, hint: 'Stories, TikTok' },
  { id: '3:2', label: '3:2', ratio: 3 / 2, hint: 'Classic photo' },
  { id: '21:9', label: '21:9', ratio: 21 / 9, hint: 'Cinematic strip' },
]

export function lightColor(k: number, tint?: string) {
  if (tint) return tint
  return hex(kelvin(k))
}

export function newLight(role: 'key' | 'fill' | 'rim' | 'top' | 'practical', o: V3): LightItem {
  const presets = {
    key: { off: { x: -1.8, y: -2.2, z: 2.0 }, kelvin: 5200, intensity: 6, range: 9, angle: 38, softness: 0.55, shadow: true, name: 'Key light' },
    fill: { off: { x: 2.2, y: -1.6, z: 1.2 }, kelvin: 7200, intensity: 2.2, range: 9, angle: 50, softness: 0.8, shadow: false, name: 'Fill light' },
    rim: { off: { x: 0.8, y: 2.4, z: 2.2 }, kelvin: 6500, intensity: 5, range: 8, angle: 34, softness: 0.4, shadow: false, name: 'Rim light' },
    top: { off: { x: 0, y: 0, z: 3.2 }, kelvin: 5600, intensity: 4, range: 7, angle: 55, softness: 0.7, shadow: true, name: 'Top light' },
    practical: { off: { x: 0.6, y: 0.6, z: 1.1 }, kelvin: 3200, intensity: 2, range: 4, angle: 90, softness: 1, shadow: false, name: 'Practical' },
  }[role]
  return {
    id: uid('li'), kind: 'light', name: presets.name, visible: true, pos: add(o, presets.off), rot: { x: 0, y: 0, z: 0 },
    type: role === 'practical' ? 'point' : 'spot', kelvin: presets.kelvin, color: lightColor(presets.kelvin), intensity: presets.intensity,
    range: presets.range, angle: presets.angle, softness: presets.softness, shadow: presets.shadow, aim: true,
  }
}

export function defaultScene(origin: V3, mode: 'here' | 'void', model?: string): Scene {
  const items: Item[] = []
  if (model) items.push({ id: uid('pr'), kind: 'prop', name: model, model, subject: true, visible: true, pos: { ...origin }, rot: { x: 0, y: 0, z: 0 } })
  items.push(newLight('key', origin), newLight('fill', origin), newLight('rim', origin))
  return {
    name: model ? `${model} studio` : 'Untitled scene', model,
    stage: { mode, origin: { ...origin } },
    env: { time: { h: mode === 'void' ? 23 : 13, m: 0 }, weather: 'EXTRASUNNY', look: { name: '', strength: 0.6 }, lodScale: 1, parkPed: true },
    backdrop: { mode: mode === 'void' ? 'sweep' : 'none', top: '#0d0d10', bottom: '#2a2a30', chroma: '#00ff40', size: 14, height: 8, floor: true },
    camera: { fov: 40, roll: 0, dof: { on: false, focus: 3, range: 1.2, strength: 0.6 } },
    items, shots: [], keys: [], overlays: [],
    output: { aspect: '1:1', format: 'png', quality: 0.95, width: 0, matte: 'none', frames: 1, exposure: 1, contrast: 1, saturation: 1, vignette: 0, key: { tol: 0.2, soft: 0.14, spill: 0.6 } },
    guides: 'thirds',
  }
}

// Converts scene coordinates between absolute world and relative stage origins.
function shift(s: Scene, by: V3, dir: 1 | -1): Scene {
  const mv = (p: V3) => (dir === 1 ? add(p, by) : sub(p, by))
  return {
    ...s,
    items: s.items.map((i) => ({ ...i, pos: mv(i.pos) })),
    shots: s.shots.map((x) => ({ ...x, pos: mv(x.pos) })),
    keys: s.keys.map((x) => ({ ...x, pos: mv(x.pos) })),
    overlays: s.overlays.map((o) => (o.kind === 'callout' ? { ...o, point: mv(o.point) } : o)),
  }
}

export const toRelative = (s: Scene): Scene => ({ ...shift(s, s.stage.origin, -1), stage: { ...s.stage, origin: { x: 0, y: 0, z: 0 } } })
export function toAbsolute(s: Scene, origin: V3): Scene {
  return { ...shift(s, origin, 1), stage: { ...s.stage, origin: { ...origin } } }
}
export function moveStage(s: Scene, origin: V3, mode: 'here' | 'void'): Scene {
  const by = sub(origin, s.stage.origin)
  return { ...shift(s, by, 1), stage: { mode, origin: { ...origin } } }
}

// Strips client-only world components from full scene definition.
export function worldPart(s: Scene) {
  return { stage: s.stage, env: s.env, backdrop: s.backdrop, camera: s.camera, items: s.items }
}

export function subjectOf(s: Scene) {
  return s.items.find((i) => i.kind === 'prop' && (i as PropItem).subject) as PropItem | undefined
}
