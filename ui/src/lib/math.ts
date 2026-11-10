// Math: the exact twin of shared/rot.lua plus the camera projection. GTA rotation order 2: R = Rz(yaw) * Rx(pitch) * Ry(roll),
// x = pitch, y = roll, z = yaw in degrees. The game's FOV is vertical. Everything the page draws over the world goes through here.
export type V3 = { x: number; y: number; z: number }
export type Basis = { r: V3; f: V3; u: V3 }
export type CamFrame = { p: V3; r: V3; fov: number; speed?: number }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z })
export const add = (a: V3, b: V3, k = 1): V3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k })
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
export const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
export const len = (a: V3) => Math.sqrt(dot(a, a))
export const norm = (a: V3): V3 => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l } }
export const dist = (a: V3, b: V3) => len(sub(a, b))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const D = Math.PI / 180

export function basis(rot: V3): Basis {
  const p = rot.x * D, ro = rot.y * D, y = rot.z * D
  const sp = Math.sin(p), cp = Math.cos(p), sr = Math.sin(ro), cr = Math.cos(ro), sy = Math.sin(y), cy = Math.cos(y)
  return {
    r: { x: cy * cr - sy * sp * sr, y: sy * cr + cy * sp * sr, z: -cp * sr },
    f: { x: -sy * cp, y: cy * cp, z: sp },
    u: { x: cy * sr + sy * sp * cr, y: sy * sr - cy * sp * cr, z: cp * cr },
  }
}

export function euler(b: Basis): V3 {
  const sp = clamp(b.f.z, -1, 1)
  const p = Math.asin(sp)
  let r: number, y: number
  if (Math.abs(sp) < 0.99999) {
    r = Math.atan2(-b.r.z, b.u.z)
    y = Math.atan2(-b.f.x, b.f.y)
  } else {
    r = 0
    y = Math.atan2(b.r.y, b.r.x)
  }
  return { x: p / D, y: r / D, z: y / D }
}

// Rodrigues: v turned by angle (degrees) about a unit axis
export function rotateAbout(v: V3, axis: V3, deg: number): V3 {
  const a = deg * D, c = Math.cos(a), s = Math.sin(a)
  const k = axis
  const kv = cross(k, v)
  const kd = dot(k, v)
  return { x: v.x * c + kv.x * s + k.x * kd * (1 - c), y: v.y * c + kv.y * s + k.y * kd * (1 - c), z: v.z * c + kv.z * s + k.z * kd * (1 - c) }
}

export function rotateBasis(b: Basis, axis: V3, deg: number): Basis {
  return { r: rotateAbout(b.r, axis, deg), f: rotateAbout(b.f, axis, deg), u: rotateAbout(b.u, axis, deg) }
}

export function local(pos: V3, b: Basis, o: V3): V3 {
  return { x: pos.x + b.r.x * o.x + b.f.x * o.y + b.u.x * o.z, y: pos.y + b.r.y * o.x + b.f.y * o.y + b.u.y * o.z, z: pos.z + b.r.z * o.x + b.f.z * o.y + b.u.z * o.z }
}

export function toLocal(pos: V3, b: Basis, w: V3): V3 {
  const d = sub(w, pos)
  return { x: dot(d, b.r), y: dot(d, b.f), z: dot(d, b.u) }
}

export function wrap180(a: number) {
  a = ((a % 360) + 360) % 360
  return a > 180 ? a - 360 : a
}

// Projection ---------------------------------------------------------------------------------------------

export type Screen = { w: number; h: number }
export type P2 = { x: number; y: number; d: number }

export function project(p: V3, cam: CamFrame, s: Screen): P2 | null {
  const b = basis(cam.r)
  const d = sub(p, cam.p)
  const y = dot(d, b.f)
  if (y < 0.02) return null
  const t = Math.tan((cam.fov * D) / 2)
  const aspect = s.w / s.h
  return { x: s.w / 2 + (dot(d, b.r) / (y * t * aspect)) * (s.w / 2), y: s.h / 2 - (dot(d, b.u) / (y * t)) * (s.h / 2), d: y }
}

export function ray(sx: number, sy: number, cam: CamFrame, s: Screen) {
  const b = basis(cam.r)
  const t = Math.tan((cam.fov * D) / 2)
  const nx = (sx / s.w) * 2 - 1
  const ny = 1 - (sy / s.h) * 2
  const dir = norm(add(add(b.f, b.r, nx * t * (s.w / s.h)), b.u, ny * t))
  return { o: cam.p, d: dir }
}

// Closest point on line (p0 + a*s) to a ray (o + d*t): returns s
export function closestOnAxis(p0: V3, a: V3, o: V3, d: V3) {
  const w = sub(p0, o)
  const aa = dot(a, a), ab = dot(a, d), bb = dot(d, d), ad = dot(a, w), bd = dot(d, w)
  const den = aa * bb - ab * ab
  if (Math.abs(den) < 1e-6) return 0
  return (ab * bd - bb * ad) / den
}

export function rayPlane(o: V3, d: V3, p0: V3, n: V3): V3 | null {
  const den = dot(d, n)
  if (Math.abs(den) < 1e-6) return null
  const t = dot(sub(p0, o), n) / den
  if (t < 0) return null
  return add(o, d, t)
}

// World size of a fixed screen fraction at a point, so the gizmo keeps its size on screen
export function screenUnit(p: V3, cam: CamFrame, frac = 0.18) {
  const b = basis(cam.r)
  const y = Math.max(0.1, dot(sub(p, cam.p), b.f))
  return y * Math.tan((cam.fov * D) / 2) * frac
}

// Round helpers: the same precision the server stores
export const r4 = (v: number) => Math.round(v * 10000) / 10000
export const r3 = (v: number) => Math.round(v * 1000) / 1000
export const snap = (v: number, step: number) => Math.round(v / step) * step
export const pos4 = (p: V3): V3 => ({ x: r4(p.x), y: r4(p.y), z: r4(p.z) })
export const rot3 = (r: V3): V3 => ({ x: r3(wrap180(r.x)), y: r3(wrap180(r.y)), z: r3(wrap180(r.z)) })

// Kelvin to rgb (Tanner Helland's fit), for studio light colour temperature
export function kelvin(k: number): [number, number, number] {
  const t = k / 100
  let r: number, g: number, b: number
  if (t <= 66) { r = 255; g = 99.4708 * Math.log(t) - 161.1196 } else { r = 329.699 * Math.pow(t - 60, -0.1332); g = 288.1222 * Math.pow(t - 60, -0.0755) }
  if (t >= 66) b = 255
  else if (t <= 19) b = 0
  else b = 138.5177 * Math.log(t - 10) - 305.0448
  return [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255)]
}

export const hex = (c: [number, number, number]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')

// Look at: the rotation that points a camera from one point at another
export function lookAt(from: V3, to: V3): V3 {
  const d = sub(to, from)
  const l = len(d) || 1
  return { x: (Math.asin(clamp(d.z / l, -1, 1)) * 180) / Math.PI, y: 0, z: (Math.atan2(-d.x, d.y) * 180) / Math.PI }
}
