import { dispatch } from '../lib/nui'
import { camStore } from '../lib/store'
import { type V3, add, basis, len, lookAt, norm, rayPlane, sub, toLocal, dot, clamp } from '../lib/math'
import type { Model, Placement } from '../lib/types'

// Browser development mock answering NUI callbacks and simulating camera.

const catalog = {
  anims: [{ label: 'Repair crouched', dict: 'mini@repair', clip: 'fixing_a_ped', flag: 1 }, { label: 'Clipboard', dict: 'amb@world_human_clipboard@male@idle_a', clip: 'idle_c', flag: 49 }, { label: 'Pick up low', dict: 'pickup_object', clip: 'pickup_low', flag: 0 }],
  scenarios: ['WORLD_HUMAN_CLIPBOARD', 'WORLD_HUMAN_WELDING', 'WORLD_HUMAN_VEHICLE_MECHANIC', 'PROP_HUMAN_ATM'],
  peds: [{ label: 'Mechanic', model: 's_m_y_xmech_02' }, { label: 'Business woman', model: 'a_f_y_business_02' }, { label: 'Chef', model: 's_m_y_chef_01' }],
  ptfx: [{ label: 'Smoke cloud', asset: 'core', name: 'exp_grd_bzgas_smoke', scale: 0.6 }, { label: 'Steam burst', asset: 'core', name: 'ent_sht_steam', scale: 1 }, { label: 'Sparking wires', asset: 'core', name: 'ent_brk_sparking_wires', scale: 1 }],
  looks: [{ label: 'None', name: '' }, { label: 'Cinema', name: 'cinema' }, { label: 'Film 04', name: 'NG_filmic04' }],
  weathers: ['EXTRASUNNY', 'CLEAR', 'CLOUDS', 'OVERCAST', 'RAIN', 'FOGGY'],
  sounds: [{ label: 'Pick up', name: 'PICK_UP', set: 'HUD_FRONTEND_DEFAULT_SOUNDSET' }],
  icons: [
    ['fas fa-hand', 'Hand'], ['fas fa-hand-holding', 'HandGrabbing'], ['fas fa-box-open', 'Package'], ['fas fa-wrench', 'Wrench'], ['fas fa-screwdriver-wrench', 'Toolbox'],
    ['fas fa-gear', 'Gear'], ['fas fa-wind', 'Wind'], ['fas fa-fire', 'Fire'], ['fas fa-droplet', 'Drop'], ['fas fa-bolt', 'Lightning'], ['fas fa-power-off', 'Power'],
    ['fas fa-lock', 'Lock'], ['fas fa-key', 'Key'], ['fas fa-door-open', 'Door'], ['fas fa-eye', 'Eye'], ['fas fa-cart-shopping', 'ShoppingCart'], ['fas fa-dollar-sign', 'CurrencyDollar'],
    ['fas fa-mug-hot', 'Coffee'], ['fas fa-utensils', 'ForkKnife'], ['fas fa-chair', 'Chair'], ['fas fa-music', 'MusicNote'], ['fas fa-lightbulb', 'Lightbulb'], ['fas fa-hammer', 'Hammer'],
    ['fas fa-gas-pump', 'GasPump'], ['fas fa-car', 'Car'], ['fas fa-tire', 'Tire'], ['fas fa-clipboard', 'Clipboard'], ['fas fa-trash', 'Trash'], ['fas fa-recycle', 'Recycle'], ['fas fa-gauge', 'Gauge'],
  ].map(([fa, preview]) => ({ fa, preview })),
}

const ia = (id: string, label: string, icon: string, steps: any[], extra: any = {}) => ({ id, label, icon, distance: 2, gates: {}, steps, enabled: true, radius: 0.3, point: null, ...extra })

const models: Record<string, Model> = {
  osm_tyre_inflator: {
    model: 'osm_tyre_inflator', label: 'Tyre Inflator', category: 'Workshop', description: 'Wall-mounted inflator with a coiled hose.',
    spawn: { mode: 'local', collision: true, freeze: true, distance: 120, lod: 300, invincible: true }, pack: 'osmfx_workshop',
    interactions: [
      ia('inflate', 'Inflate tyre', 'fas fa-wind', [{ type: 'progress', duration: 4000, label: 'Inflating', canCancel: true, freeze: true }, { type: 'clientEvent', name: 'osm_svcbay:inflate' }], { point: { x: 0.12, y: -0.05, z: 0.62 } }),
      ia('gauge', 'Check pressure', 'fas fa-gauge', [{ type: 'notify', text: '32 psi', kind: 'info' }], { point: { x: -0.08, y: -0.06, z: 0.9 } }),
    ],
  } as any,
  prop_toolchest_05: {
    model: 'prop_toolchest_05', label: 'Tool Chest', category: 'Workshop', spawn: { mode: 'local', collision: true, freeze: true, distance: 120, lod: 300, invincible: true },
    interactions: [ia('open', 'Open drawers', 'fas fa-box-open', [{ type: 'setState', key: 'open', toggle: true }]), ia('take', 'Take a wrench', 'fas fa-wrench', [{ type: 'progress', duration: 2000, label: 'Searching' }, { type: 'giveItem', item: 'wrench', count: 1 }], { gates: { groups: { mechanic: 0 }, cooldown: 300, cooldownScope: 'player' } })],
  } as any,
  prop_vend_coffe_01: {
    model: 'prop_vend_coffe_01', label: 'Coffee Machine', category: 'Retail', spawn: { mode: 'networked', collision: true, freeze: true, distance: 150, lod: 300, invincible: true }, worldTargets: true,
    interactions: [ia('buy', 'Buy coffee ($5)', 'fas fa-mug-hot', [{ type: 'removeMoney', account: 'cash', amount: 5 }, { type: 'progress', duration: 2500, label: 'Pouring' }, { type: 'giveItem', item: 'coffee', count: 1 }])],
  } as any,
  prop_barrier_work05: { model: 'prop_barrier_work05', label: 'Road Barrier', category: 'Street', spawn: { mode: 'local', collision: true, freeze: true, distance: 200, lod: 400, invincible: true }, interactions: [] } as any,
  osm_neon_sign: { model: 'osm_neon_sign', label: 'Neon Sign "Open"', category: 'Retail', spawn: { mode: 'local', collision: false, freeze: true, distance: 300, lod: 800, invincible: true }, interactions: [], pack: 'osmfx_retail', modified: true } as any,
}

const P = (id: string, model: string, pos: V3, extra: any = {}): Placement => ({ id, model, pos, rot: { x: 0, y: 0, z: 90 }, enabled: true, inherit: true, interactions: [], ...extra })
const placements: Record<string, Placement> = Object.fromEntries([
  P('pk_a1b2c3d4e5', 'osm_tyre_inflator', { x: 4.2, y: 1.1, z: 0 }, { label: 'Bay 1 inflator', group: 'Legion garage', pack: 'osmfx_workshop', key: 'legion_bay1' }),
  P('pk_f6g7h8i9j0', 'osm_tyre_inflator', { x: 12.2, y: 1.1, z: 0 }, { label: 'Bay 2 inflator', group: 'Legion garage', pack: 'osmfx_workshop', modified: true }),
  P('pk_k1l2m3n4o5', 'prop_toolchest_05', { x: 6, y: -3, z: 0 }, { group: 'Legion garage', state: { open: true } }),
  P('pk_p6q7r8s9t0', 'prop_vend_coffe_01', { x: -40, y: 22, z: 0 }, { netId: 2311, anchor: { model: 1234567, pos: { x: -40, y: 22, z: 0 } } }),
  P('pk_u1v2w3x4y5', 'prop_barrier_work05', { x: 380, y: -1200, z: 30 }, { enabled: false }),
  P('pk_z6a7b8c9d0', 'osm_neon_sign', { x: 1800, y: 3600, z: 40 }, { label: 'Sandy diner sign', hidden: true, pack: 'osmfx_retail' }),
].map((p) => [p.id, p]))

// Simulated camera kinematics.

const cam = { p: { x: 3.2, y: -4.6, z: 2.1 }, r: { x: -14, y: 0, z: 30 }, fov: 50 }
let held = { f: 0, r: 0, u: 0, fast: false }
let orbitC: V3 | null = null
let speed = 4
let editorT: { pos: V3; rot: V3 } = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 25 } }
export const devWorld = { matte: null as string | null, editor: () => editorT, studio: null as any, dims: { min: { x: -0.35, y: -0.25, z: 0 }, max: { x: 0.35, y: 0.25, z: 1.1 } } }

function tick() {
  const b = basis(cam.r)
  const v = add(add(add({ x: 0, y: 0, z: 0 }, b.f, held.f), b.r, held.r), { x: 0, y: 0, z: 1 }, held.u)
  const l = len(v)
  if (l > 0) cam.p = add(cam.p, norm(v), (speed * (held.fast ? 4 : 1)) / 60)
  camStore.set({ p: { ...cam.p }, r: { ...cam.r }, fov: cam.fov, speed })
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

function setCam(p: V3, r?: V3, fov?: number) { cam.p = { ...p }; if (r) cam.r = { ...r }; if (fov) cam.fov = fov }

function boxHit(o: V3, d: V3, pos: V3, rot: V3, dims: any) {
  const b = basis(rot)
  const lo = toLocal(pos, b, o)
  const ld = { x: dot(d, b.r), y: dot(d, b.f), z: dot(d, b.u) }
  let tmin = -Infinity, tmax = Infinity
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(ld[k]) < 1e-9) { if (lo[k] < dims.min[k] || lo[k] > dims.max[k]) return null; continue }
    const t1 = (dims.min[k] - lo[k]) / ld[k], t2 = (dims.max[k] - lo[k]) / ld[k]
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2))
  }
  if (tmax < Math.max(0, tmin)) return null
  return { x: lo.x + ld.x * tmin, y: lo.y + ld.y * tmin, z: lo.z + ld.z * tmin }
}

const shots: any[] = []

export function mock(event: string, data: any): any {
  switch (event) {
    case 'boot': return {
      catalog, strings: {}, target: 'osm', framework: 'qbx', perms: { edit: true, studio: true, packs: true },
      editor: { snapMove: [0.01, 0.05, 0.1, 0.25, 0.5, 1], snapTurn: [1, 5, 15, 45, 90], reach: 250 },
      interact: { accounts: ['cash', 'bank'], commands: true, exports: true, maxSteps: 24 }, studio: { upload: 'none', thumbSize: 360 }, stream: { distance: 120, lod: 300 },
    }
    case 'hub:data': return { models: Object.values(models), placements: Object.values(placements), me: { x: 2, y: 0, z: 0 }, perms: { edit: true, studio: true, packs: true } }
    case 'hub:place': case 'hub:edit': case 'hub:points': {
      const p = data.id ? placements[data.id] : null
      editorT = { pos: p ? { ...p.pos } : { x: 0, y: 0, z: 0 }, rot: p ? { ...p.rot } : { x: 0, y: 0, z: 25 } }
      const model = p ? p.model : data.model
      const m = models[model]
      setCam(add(editorT.pos, { x: 2.2, y: -2.8, z: 1.6 }), lookAt(add(editorT.pos, { x: 2.2, y: -2.8, z: 1.6 }), add(editorT.pos, { x: 0, y: 0, z: 0.55 })))
      setTimeout(() => dispatch('screen', { screen: 'editor', data: {
        kind: data.interaction ? 'points' : 'placement', id: p?.id, model, label: p?.label ?? m?.label ?? model, pos: editorT.pos, rot: editorT.rot, dims: devWorld.dims,
        settings: { label: p?.label, group: p?.group, inherit: true, enabled: true }, points: (m?.interactions ?? []).filter((i: any) => i.point).map((i: any) => ({ id: i.id, label: i.label, point: i.point, radius: i.radius })),
        pointsOnly: !!data.interaction, focus: data.interaction,
      } }), 120)
      return true
    }
    case 'hub:studio': setTimeout(() => openStudio(data.model), 100); return true
    case 'hub:modelInfo': return { ok: data.model.length > 3, hash: 123, size: { x: 1, y: 1, z: 1 } }
    case 'editor:set': editorT = { pos: data.pos, rot: data.rot }; return true
    case 'editor:raycast': {
      if (data.mode === 'prop') {
        const h = boxHit(data.o, data.d, editorT.pos, editorT.rot, devWorld.dims)
        return h ? { hit: true, pos: h, local_: { x: +h.x.toFixed(4), y: +h.y.toFixed(4), z: +h.z.toFixed(4) } } : { hit: false }
      }
      const hit = rayPlane(data.o, data.d, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
      return hit ? { hit: true, pos: hit, normal: { x: 0, y: 0, z: 1 }, entity: data.mode === 'pick' ? 4242 : undefined, model: 9999 } : { hit: false }
    }
    case 'editor:ground': return { ok: true, pos: { ...data.pos, z: 0 }, rot: data.rot }
    case 'editor:anchor': return data.clear ? { ok: true } : { ok: true, anchor: { model: 1234567, pos: { x: 0, y: 0, z: 0 } } }
    case 'editor:save': case 'editor:cancel': case 'editor:points:done': setTimeout(() => dispatch('screen', { screen: 'hub', data: { view: true } }), 200); return { ok: true }
    case 'cam:input': held = { f: data.f, r: data.r, u: data.u, fast: !!data.fast }; return true
    case 'cam:look': cam.r = { x: clamp(cam.r.x - data.dy * 0.12, -89, 89), y: cam.r.y, z: cam.r.z - data.dx * 0.12 }; orbitC = null; return true
    case 'cam:orbit': {
      const c = orbitC ?? data.center
      if (!c) return true
      orbitC = c
      const off = sub(cam.p, c)
      const d = len(off)
      const yaw = (Math.atan2(-off.x, off.y) * 180) / Math.PI - data.dx * 0.25
      const pitch = clamp((Math.asin(off.z / d) * 180) / Math.PI + data.dy * 0.2, -85, 85)
      const cp = Math.cos((pitch * Math.PI) / 180)
      cam.p = add(c, { x: -Math.sin((yaw * Math.PI) / 180) * cp, y: Math.cos((yaw * Math.PI) / 180) * cp, z: Math.sin((pitch * Math.PI) / 180) }, d)
      cam.r = lookAt(cam.p, c)
      return true
    }
    case 'cam:pan': { const b = basis(cam.r); cam.p = add(add(cam.p, b.r, -data.dx * 0.006), b.u, data.dy * 0.006); return true }
    case 'cam:zoom': { const b = basis(cam.r); cam.p = add(cam.p, b.f, -data.delta * 0.4); return true }
    case 'cam:speed': speed = clamp(speed * (1 - data.delta * 0.15), 0.25, 40); return { speed }
    case 'cam:focus': { const b = basis(cam.r); setCam(add(data.center, b.f, -Math.max(0.8, data.radius * 2.6))); orbitC = data.center; return true }
    case 'studio:cam': setCam(data.pos, data.rot, data.fov); if (data.center) orbitC = data.center; return true
    case 'studio:sync': devWorld.studio = data.scene; return true
    case 'studio:item': if (devWorld.studio) devWorld.studio.items = devWorld.studio.items.map((i: any) => (i.id === data.id ? { ...i, pos: data.pos, rot: data.rot } : i)); return true
    case 'studio:dims': return { ok: true, min: devWorld.dims.min, max: devWorld.dims.max }
    case 'studio:pick': {
      for (const it of devWorld.studio?.items ?? []) {
        if (it.kind === 'prop' && boxHit(data.o, data.d, it.pos, it.rot, devWorld.dims)) return { hit: true, pos: it.pos, id: it.id }
      }
      const hit = rayPlane(data.o, data.d, devWorld.studio?.stage.origin ?? { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
      return hit ? { hit: true, pos: hit, normal: { x: 0, y: 0, z: 1 } } : { hit: false }
    }
    case 'studio:ground': { const it = devWorld.studio?.items.find((i: any) => i.id === data.id); return it ? { ok: true, pos: { ...it.pos, z: devWorld.studio.stage.origin.z } } : { ok: false } }
    case 'studio:matte': devWorld.matte = data.mode; return true
    case 'studio:upload:begin': { const id = 'sh_' + Math.random().toString(36).slice(2, 8); shots.push({ id, ...data, got: 0 }); return { ok: true, id } }
    case 'studio:upload:chunk': {
      const s = shots.find((x) => x.id === data.id)
      s.got++
      if (s.got === s.chunks) setTimeout(() => dispatch('studio:shot', { id: s.id, ok: true, file: `shots/2026-11-08/${s.name.replace(/\W+/g, '_')}.${s.ext}`, path: `C:/server/resources/osm-propkit/shots/2026-11-08/${s.name}.${s.ext}`, bytes: s.size * 0.75 }), 200)
      return true
    }
    case 'studio:play': {
      const keys = data.keys
      const t0 = performance.now()
      const total = keys[keys.length - 1].t
      const step = () => {
        const t = (performance.now() - t0) / 1000
        if (t >= total) { dispatch('studio:path', { done: true }); return }
        let i = 0
        while (i < keys.length - 2 && keys[i + 1].t <= t) i++
        const a = keys[i], b = keys[i + 1]
        const u = (t - a.t) / (b.t - a.t)
        setCam({ x: a.pos.x + (b.pos.x - a.pos.x) * u, y: a.pos.y + (b.pos.y - a.pos.y) * u, z: a.pos.z + (b.pos.z - a.pos.z) * u }, { x: a.rot.x + (b.rot.x - a.rot.x) * u, y: 0, z: a.rot.z + (b.rot.z - a.rot.z) * u })
        dispatch('studio:path', { t })
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
      return true
    }
    case 'studio:exit': dispatch('screen', { screen: null }); return true
    case 'rpc': return rpcMock(data.name, data.args)
  }
  return { ok: true }
}


export function openStudio(model?: string) {
  const origin = { x: -2200, y: -3600, z: 900 }
  setCam(add(origin, { x: 1.6, y: -2.6, z: 1.2 }), lookAt(add(origin, { x: 1.6, y: -2.6, z: 1.2 }), add(origin, { x: 0, y: 0, z: 0.55 })), 40)
  dispatch('screen', { screen: 'studio', data: { here: { pos: { x: 0, y: 0, z: 0 }, heading: 0 }, void: origin, model: model ?? 'osm_tyre_inflator' } })
}

function rpcMock(name: string, a: any): any {
  switch (name) {
    case 'model:save': { const m = { ...models[a.model.model], ...a.model }; models[m.model] = m; dispatch('hub:delta', { kind: 'models', up: [m], rm: [] }); return { ok: true, model: m } }
    case 'model:delete': delete models[a.model]; dispatch('hub:delta', { kind: 'models', up: [], rm: [a.model] }); return { ok: true }
    case 'placement:save': { const id = a.placement.id ?? 'pk_' + Math.random().toString(36).slice(2, 12); const p = { ...a.placement, id }; placements[id] = p; dispatch('hub:delta', { kind: 'placements', up: [p], rm: [] }); return { ok: true, placement: p } }
    case 'placement:delete': { const ids = a.ids ?? [a.id]; ids.forEach((i: string) => delete placements[i]); dispatch('hub:delta', { kind: 'placements', up: [], rm: ids }); return { ok: true } }
    case 'placement:toggle': { const ids = a.ids ?? [a.id]; const up = ids.map((i: string) => (placements[i] = { ...placements[i], enabled: a.enabled })); dispatch('hub:delta', { kind: 'placements', up, rm: [] }); return { ok: true } }
    case 'placement:reset': return { ok: true }
    case 'thumbs': return { ok: true, thumbs: {} }
    case 'packs:list': return { ok: true,
      installed: [{ id: 'osmfx_workshop', name: 'OsmFX Workshop', version: '1.0.0', author: 'OsmFX', installed: Date.now() / 1000 - 86400 * 3, counts: { models: 1, placements: 2, scenes: 1, modified: 1 } }, { id: 'osmfx_retail', name: 'OsmFX Retail Signs', version: '0.9.2', author: 'OsmFX', installed: Date.now() / 1000 - 3600, counts: { models: 1, placements: 1, scenes: 0, modified: 1 } }],
      available: [
        { source: 'res:osm_svcbay:propkit/pack.json', label: 'osm_svcbay/propkit/pack.json', resource: 'osm_svcbay', id: 'osmfx_workshop', name: 'OsmFX Workshop', version: '1.1.0', installed: '1.0.0', status: 'update', counts: { models: 3, placements: 6, scenes: 2, interactions: 7 } },
        { source: 'file:tumbler.json', label: 'packs/tumbler.json', id: 'osmfx_tumbler', name: 'Tumbler Safes', version: '1.0.0', author: 'OsmFX', status: 'new', counts: { models: 2, placements: 0, scenes: 1, interactions: 4 } },
        { source: 'file:broken.json', label: 'packs/broken.json', status: 'invalid', error: 'missing id', id: '', name: '', version: '' },
      ] }
    case 'packs:stage': return { ok: true, token: 'imp_x1', pack: { id: 'osmfx_workshop', name: 'OsmFX Workshop', version: '1.1.0', installed: '1.0.0', author: 'OsmFX', description: 'Tyre inflator, tool chest and lift with default Legion garage locations.' }, sections: {
      models: { counts: { update: 1, add: 2 }, items: [{ key: 'osm_tyre_inflator', label: 'Tyre Inflator', status: 'update' }, { key: 'osm_lift', label: 'Two-post lift', status: 'add' }, { key: 'prop_toolchest_05', label: 'Tool Chest', status: 'add' }] },
      interactions: { counts: { same: 1, update: 1, add: 4, conflict: 1 }, items: [{ key: 'osm_tyre_inflator/inflate', label: 'Inflate tyre', status: 'update' }, { key: 'osm_tyre_inflator/gauge', label: 'Check pressure', status: 'conflict', why: 'changed on this server' }, { key: 'osm_lift/raise', label: 'Raise lift', status: 'add' }, { key: 'osm_lift/lower', label: 'Lower lift', status: 'add' }, { key: 'prop_toolchest_05/open', label: 'Open drawers', status: 'add' }, { key: 'prop_toolchest_05/take', label: 'Take a wrench', status: 'add' }, { key: 'osm_tyre_inflator/hose', label: 'Take hose', status: 'same' }] },
      placements: { counts: { same: 1, conflict: 1, add: 4 }, items: [{ key: 'legion_bay1', label: 'Bay 1 inflator', status: 'same' }, { key: 'legion_bay2', label: 'Bay 2 inflator', status: 'conflict', why: 'moved or edited on this server' }, { key: 'legion_lift1', label: 'Lift 1', status: 'add' }, { key: 'legion_lift2', label: 'Lift 2', status: 'add' }, { key: 'legion_chest', label: 'Tool chest', status: 'add' }, { key: 'legion_chest2', label: 'Tool chest 2', status: 'add' }] },
      scenes: { counts: { add: 1, removed: 1 }, items: [{ key: 'hero', label: 'Inflator hero shot', status: 'add' }, { key: 'old', label: 'Old scene', status: 'removed' }] },
    } }
    case 'packs:apply': return { ok: true, done: { models: 3, interactions: 6, placements: 4, scenes: 1, removed: 0 } }
    case 'packs:uninstall': return { ok: true }
    case 'packs:export': return { ok: true, file: `exports/${a.id}-${a.version}.json`, path: `C:/server/resources/osm-propkit/exports/${a.id}-${a.version}.json`, text: JSON.stringify({ format: 'osm-propkit/pack@1', id: a.id, name: a.name, version: a.version, models: a.models.map((m: string) => models[m]) }, null, 2), counts: { models: a.models.length, placements: 2, scenes: 0 } }
    case 'scenes:list': return { ok: true, scenes: [{ id: 'sc_1', name: 'Inflator hero shot', model: 'osm_tyre_inflator', pack: 'osmfx_workshop' }] }
    case 'scene:save': return { ok: true, id: a.scene.id ?? 'sc_new' }
    case 'shots:list': return { ok: true, shots: [] }
    case 'shot:delete': case 'model:thumb': return { ok: true }
  }
  return { ok: true }
}
