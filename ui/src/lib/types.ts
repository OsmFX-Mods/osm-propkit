import type { V3 } from './math'

export type Anim = { dict?: string; clip?: string; flag?: number; scenario?: string }

export type StepType =
  | 'progress' | 'anim' | 'wait' | 'notify' | 'sound' | 'ptfx' | 'clientEvent' | 'serverEvent' | 'command' | 'export'
  | 'giveItem' | 'removeItem' | 'giveMoney' | 'removeMoney' | 'setState' | 'swapModel' | 'pickup'

export type Step = {
  type: StepType
  duration?: number; label?: string; anim?: Anim; canCancel?: boolean; freeze?: boolean
  prop?: { model: string; bone: number; pos: V3; rot: V3 }
  text?: string; kind?: 'info' | 'success' | 'error' | 'warning'
  name?: string; set?: string; asset?: string; scale?: number
  args?: unknown; via?: 'net' | 'internal'; command?: string
  resource?: string; fn?: string; side?: 'client' | 'server'
  item?: string; count?: number; metadata?: unknown
  account?: string; amount?: number
  key?: string; value?: unknown; toggle?: boolean; persist?: boolean
  model?: string; respawn?: number
}

export type Gates = {
  groups?: Record<string, number>; items?: Record<string, number>; anyItem?: boolean
  cooldown?: number; cooldownScope?: 'player' | 'placement' | 'global'
  hideIneligible?: boolean; state?: Record<string, unknown>; onFoot?: boolean; hours?: [number, number]
}

export type Interaction = {
  id: string; label: string; icon: string; iconColor?: string; description?: string
  distance: number; point?: V3 | null; radius?: number; bones?: string[]
  gates: Gates; steps: Step[]; enabled: boolean; order?: number; origin?: string
}

export type Spawn = { mode: 'local' | 'networked'; collision: boolean; freeze: boolean; distance: number; lod: number; invincible: boolean }

export type Model = {
  model: string; label: string; category: string; description?: string; tags?: string[]
  spawn: Spawn; interactions: Interaction[]; worldTargets?: boolean; thumb?: string
  pack?: string; modified?: boolean
}

export type Anchor = { model: number | string; pos: V3; rot?: V3; offset?: V3; local_rot?: V3; radius?: number }

export type Placement = {
  id: string; model: string; label?: string; group?: string; pos: V3; rot: V3
  mode?: 'local' | 'networked'; distance?: number; lod?: number; collision?: boolean; freeze?: boolean; alpha?: number
  enabled?: boolean; inherit?: boolean; interactions?: Interaction[]; anchor?: Anchor; interior?: { hash: number; room: number }
  pack?: string; key?: string; modified?: boolean
  state?: Record<string, unknown>; hidden?: boolean; swap?: string; netId?: number
}

export type Perms = { edit?: boolean; studio?: boolean; packs?: boolean }

export type Catalog = {
  anims: { label: string; dict: string; clip: string; flag: number }[]
  scenarios: string[]
  peds: { label: string; model: string }[]
  ptfx: { label: string; asset: string; name: string; scale: number }[]
  looks: { label: string; name: string }[]
  weathers: string[]
  sounds: { label: string; name: string; set: string }[]
  icons: { fa: string; preview: string }[]
}

export type Boot = {
  catalog: Catalog
  strings: Record<string, string>
  target: 'osm' | 'ox' | 'qb' | 'none'
  framework: string
  editor: { snapMove: number[]; snapTurn: number[]; reach: number }
  interact: { accounts: string[]; commands: boolean; exports: boolean; maxSteps: number }
  studio: { upload: string; thumbSize: number }
  stream: { distance: number; lod: number }
  perms: Perms
}

export type DiffItem = { key: string; label?: string; model?: string; status: 'add' | 'update' | 'same' | 'conflict' | 'removed'; why?: string; pos?: V3 }
export type DiffSection = { items: DiffItem[]; counts: Partial<Record<DiffItem['status'], number>> }
export type Diff = {
  ok: boolean; token: string; msg?: string
  pack: { id: string; name: string; version: string; author?: string; description?: string; installed?: string }
  sections: Record<'models' | 'interactions' | 'placements' | 'scenes', DiffSection>
}

export type PackEntry = {
  source?: string; label?: string; resource?: string; id: string; name: string; version: string; author?: string; description?: string
  status?: 'new' | 'update' | 'installed' | 'older' | 'invalid'; error?: string; installed?: string | number
  counts?: { models: number; placements: number; scenes: number; interactions?: number; modified?: number }
}

export type Shot = { id: string; file: string; path?: string; model?: string; scene?: string; width: number; height: number; bytes: number; thumb?: string; url?: string; created?: number; local?: string }
