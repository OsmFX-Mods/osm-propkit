-- GTA V Euler rotation order 2 matrix basis conversions and relative transformations.
Rot = {}

local rad, deg, sin, cos, asin, atan = math.rad, math.deg, math.sin, math.cos, math.asin, math.atan

-- Computes right, forward, and up basis vectors from Euler angles.
function Rot.basis(r)
  local p, ro, y = rad(r.x), rad(r.y), rad(r.z)
  local sp, cp, sr, cr, sy, cy = sin(p), cos(p), sin(ro), cos(ro), sin(y), cos(y)
  local right = { x = cy * cr - sy * sp * sr, y = sy * cr + cy * sp * sr, z = -cp * sr }
  local fwd = { x = -sy * cp, y = cy * cp, z = sp }
  local up = { x = cy * sr + sy * sp * cr, y = sy * sr - cy * sp * cr, z = cp * cr }
  return right, fwd, up
end

-- Extracts Euler rotation angles from orthogonal basis vectors.
function Rot.euler(right, fwd, up)
  local sp = math.max(-1.0, math.min(1.0, fwd.z))
  local p = asin(sp)
  local r, y
  if math.abs(sp) < 0.99999 then
    r = atan(-right.z, up.z)
    y = atan(-fwd.x, fwd.y)
  else
    r = 0.0
    y = atan(right.y, right.x)
  end
  return { x = deg(p), y = deg(r), z = deg(y) }
end

local function mul(a, v) -- a = {right, fwd, up} columns, v local -> world
  return {
    x = a[1].x * v.x + a[2].x * v.y + a[3].x * v.z,
    y = a[1].y * v.x + a[2].y * v.y + a[3].y * v.z,
    z = a[1].z * v.x + a[2].z * v.y + a[3].z * v.z,
  }
end

local function dot(a, b) return a.x * b.x + a.y * b.y + a.z * b.z end

-- Transforms local offset and rotation to world coordinates.
function Rot.compose(parentPos, parentRot, offset, localRot)
  local pr, pf, pu = Rot.basis(parentRot)
  local P = { pr, pf, pu }
  local o = mul(P, offset)
  local cr, cf, cu = Rot.basis(localRot)
  local wr, wf, wu = mul(P, cr), mul(P, cf), mul(P, cu)
  return { x = parentPos.x + o.x, y = parentPos.y + o.y, z = parentPos.z + o.z }, Rot.euler(wr, wf, wu)
end

-- Transforms world coordinates to local space relative to a parent transform.
function Rot.relative(parentPos, parentRot, worldPos, worldRot)
  local pr, pf, pu = Rot.basis(parentRot)
  local d = { x = worldPos.x - parentPos.x, y = worldPos.y - parentPos.y, z = worldPos.z - parentPos.z }
  local offset = { x = dot(d, pr), y = dot(d, pf), z = dot(d, pu) }
  local wr, wf, wu = Rot.basis(worldRot)
  local function toLocal(v) return { x = dot(v, pr), y = dot(v, pf), z = dot(v, pu) } end
  return offset, Rot.euler(toLocal(wr), toLocal(wf), toLocal(wu))
end

-- Transforms a local offset point into world space using stored coordinates and rotation.
function Rot.offset(pos, rot, offset)
  local r, f, u = Rot.basis(rot)
  local o = mul({ r, f, u }, offset)
  return { x = pos.x + o.x, y = pos.y + o.y, z = pos.z + o.z }
end
