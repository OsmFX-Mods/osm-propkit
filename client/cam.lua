-- Scripted camera controller providing fly, orbit, pan, and cinematic path modes.
Cam = { active = false, pos = { x = 0.0, y = 0.0, z = 0.0 }, rot = { x = 0.0, y = 0.0, z = 0.0 }, fov = 50.0 }

local E = Config.Editor
local cam
local target = { rot = { x = 0.0, y = 0.0, z = 0.0 }, fov = 50.0 }
local vel = { x = 0.0, y = 0.0, z = 0.0 }
local held = { f = 0, r = 0, u = 0, fast = false, slow = false }
local look = { x = 0.0, y = 0.0 }
local tween
local speed = E.flySpeed
local orbitCenter
local lastSend = 0
local dof

local function v(x, y, z) return { x = x, y = y, z = z } end
local function add(a, b, k) k = k or 1.0 return v(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k) end
local function sub(a, b) return v(a.x - b.x, a.y - b.y, a.z - b.z) end
local function len(a) return math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) end

local function wrap(a)
  a = a % 360.0
  if a > 180.0 then a = a - 360.0 end
  return a
end

local function lookAt(from, to)
  local d = sub(to, from)
  local l = len(d)
  if l < 1e-4 then return v(0.0, 0.0, 0.0) end
  return v(math.deg(math.asin(d.z / l)), 0.0, math.deg(math.atan(-d.x, d.y)))
end
Cam.lookAt = lookAt

local function ease(t) return t < 0.5 and 4 * t * t * t or 1 - (-2 * t + 2) ^ 3 / 2 end

function Cam.start(pos, rot, fov)
  if not cam then cam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true) end
  Cam.pos, Cam.rot, Cam.fov = Util.copy(pos), Util.copy(rot), fov or 50.0
  target.rot, target.fov = Util.copy(Cam.rot), Cam.fov
  vel = v(0.0, 0.0, 0.0)
  held = { f = 0, r = 0, u = 0, fast = false, slow = false }
  look = { x = 0.0, y = 0.0 }
  tween, orbitCenter, dof = nil, nil, nil
  SetCamCoord(cam, pos.x, pos.y, pos.z)
  SetCamRot(cam, rot.x, rot.y, rot.z, 2)
  SetCamFov(cam, Cam.fov)
  SetCamActive(cam, true)
  RenderScriptCams(true, true, 400, true, false)
  Cam.active = true
end

-- Initializes camera state matching current gameplay camera coordinates.
function Cam.fromGameplay()
  local c, r = GetGameplayCamCoord(), GetGameplayCamRot(2)
  Cam.start(v(c.x, c.y, c.z), v(r.x, 0.0, r.z), GetGameplayCamFov())
end

function Cam.stop()
  if not Cam.active then return end
  Cam.active = false
  RenderScriptCams(false, true, 400, true, false)
  if cam then
    SetCamUseShallowDofMode(cam, false)
    DestroyCam(cam, false)
    cam = nil
  end
  ClearFocus()
end

-- Smoothly interpolates camera position, rotation, and field of view.
function Cam.tween(pos, rot, fov, ms)
  tween = { from = { pos = Util.copy(Cam.pos), rot = Util.copy(Cam.rot), fov = Cam.fov }, to = { pos = pos, rot = rot or Cam.rot, fov = fov or Cam.fov }, t0 = GetGameTimer(), ms = ms or 600 }
  target.rot, target.fov = Util.copy(tween.to.rot), tween.to.fov
  vel = v(0.0, 0.0, 0.0)
end

function Cam.set(pos, rot, fov)
  tween = nil
  Cam.pos, Cam.rot = Util.copy(pos), Util.copy(rot)
  target.rot = Util.copy(rot)
  if fov then Cam.fov, target.fov = fov, fov end
end

-- Centers camera on a target coordinate given a bounding radius.
function Cam.focus(center, radius)
  local _, fwd = Rot.basis(Cam.rot)
  local d = math.max(0.6, radius / math.tan(math.rad(Cam.fov * 0.5)) * 1.25)
  Cam.tween(add(center, fwd, -d), Cam.rot, Cam.fov, 500)
  orbitCenter = Util.copy(center)
end

function Cam.setOrbitCenter(c) orbitCenter = c and Util.copy(c) or nil end

function Cam.setFov(f) target.fov = Util.clamp(f, 5.0, 120.0) end
function Cam.setRoll(r) target.rot.y = r end

-- Updates depth-of-field settings applied each frame.
function Cam.setDof(d) dof = d end

-- Computes Catmull-Rom spline camera transitions across keyframe sequences.
local path
local function catmull(p0, p1, p2, p3, t)
  local t2, t3 = t * t, t * t * t
  local function c(a, b, cc, d) return 0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3) end
  return v(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y), c(p0.z, p1.z, p2.z, p3.z))
end

function Cam.play(keys, loop)
  if type(keys) ~= 'table' or #keys < 2 then return end
  table.sort(keys, function(a, b) return a.t < b.t end)
  path = { keys = keys, t0 = GetGameTimer(), loop = loop, total = keys[#keys].t }
  tween = nil
end

function Cam.stopPath() path = nil end
function Cam.playing() return path ~= nil end

local function samplePath(now)
  local k = path.keys
  local t = (now - path.t0) / 1000.0
  if t >= path.total then
    if path.loop then path.t0 = now t = 0.0 else
      local last = k[#k]
      Cam.pos, Cam.rot, Cam.fov = Util.copy(last.pos), Util.copy(last.rot), last.fov or Cam.fov
      target.rot, target.fov = Util.copy(Cam.rot), Cam.fov
      path = nil
      UI.send('studio:path', { done = true })
      return
    end
  end
  local i = 1
  while i < #k - 1 and k[i + 1].t <= t do i = i + 1 end
  local a, b = k[i], k[i + 1]
  local seg = math.max(0.001, b.t - a.t)
  local u = Util.clamp((t - a.t) / seg, 0.0, 1.0)
  if (a.ease or 'smooth') == 'smooth' then u = ease(u) end
  local p0, p3 = k[i - 1] or a, k[i + 2] or b
  Cam.pos = catmull(p0.pos, a.pos, b.pos, p3.pos, u)
  Cam.rot = v(a.rot.x + wrap(b.rot.x - a.rot.x) * u, a.rot.y + wrap(b.rot.y - a.rot.y) * u, a.rot.z + wrap(b.rot.z - a.rot.z) * u)
  Cam.fov = (a.fov or Cam.fov) + ((b.fov or Cam.fov) - (a.fov or Cam.fov)) * u
  target.rot, target.fov = Util.copy(Cam.rot), Cam.fov
  UI.send('studio:path', { t = t })
end

-- NUI camera input event handlers.

RegisterNUICallback('cam:input', function(d, cb)
  held.f, held.r, held.u = tonumber(d.f) or 0, tonumber(d.r) or 0, tonumber(d.u) or 0
  held.fast, held.slow = d.fast == true, d.slow == true
  cb(true)
end)

RegisterNUICallback('cam:look', function(d, cb)
  look.x = look.x + (tonumber(d.dx) or 0)
  look.y = look.y + (tonumber(d.dy) or 0)
  cb(true)
end)

RegisterNUICallback('cam:orbit', function(d, cb)
  cb(true)
  local c = orbitCenter or (d.center and Util.vec(d.center))
  if not c then return end
  tween = nil
  local off = sub(Cam.pos, c)
  local dist = math.max(0.2, len(off))
  local yaw = math.deg(math.atan(-off.x, off.y)) - (tonumber(d.dx) or 0) * 0.25
  local pitch = Util.clamp(math.deg(math.asin(off.z / dist)) + (tonumber(d.dy) or 0) * 0.2, -85.0, 85.0)
  local cp = math.cos(math.rad(pitch))
  local dir = v(-math.sin(math.rad(yaw)) * cp, math.cos(math.rad(yaw)) * cp, math.sin(math.rad(pitch)))
  Cam.pos = add(c, dir, dist)
  local r = lookAt(Cam.pos, c)
  r.y = Cam.rot.y
  Cam.rot, target.rot = r, Util.copy(r)
end)

RegisterNUICallback('cam:pan', function(d, cb)
  cb(true)
  tween = nil
  local right, _, up = Rot.basis(Cam.rot)
  local dist = orbitCenter and len(sub(Cam.pos, orbitCenter)) or 3.0
  local k = dist * 0.0018
  local delta = add(v(0.0, 0.0, 0.0), right, -(tonumber(d.dx) or 0) * k)
  delta = add(delta, up, (tonumber(d.dy) or 0) * k)
  Cam.pos = add(Cam.pos, delta)
  if orbitCenter then orbitCenter = add(orbitCenter, delta) end
end)

RegisterNUICallback('cam:zoom', function(d, cb)
  cb(true)
  tween = nil
  local delta = tonumber(d.delta) or 0
  local _, fwd = Rot.basis(Cam.rot)
  if orbitCenter then
    local dist = len(sub(Cam.pos, orbitCenter))
    local nd = Util.clamp(dist * (1.0 + delta * 0.12), 0.15, 400.0)
    Cam.pos = add(Cam.pos, fwd, dist - nd)
  else
    Cam.pos = add(Cam.pos, fwd, -delta * speed * 0.35)
  end
end)

RegisterNUICallback('cam:speed', function(d, cb)
  local r = E.flySpeedRange
  speed = Util.clamp(speed * (1.0 - (tonumber(d.delta) or 0) * 0.15), r[1], r[2])
  cb({ speed = speed })
end)

RegisterNUICallback('cam:focus', function(d, cb)
  cb(true)
  local c = Util.vec(d.center)
  if c then Cam.focus(c, tonumber(d.radius) or 1.0) end
end)

RegisterNUICallback('cam:fov', function(d, cb)
  if tonumber(d.fov) then Cam.setFov(tonumber(d.fov)) end
  if tonumber(d.roll) then Cam.setRoll(tonumber(d.roll)) end
  cb(true)
end)

-- Main camera render loop applying physics, easing, and NUI sync.

CreateThread(function()
  while true do
    if Cam.active and cam then
      local dt = math.min(GetFrameTime(), 0.05)
      local now = GetGameTimer()
      if path then
        samplePath(now)
      elseif tween then
        local t = math.min(1.0, (now - tween.t0) / tween.ms)
        local k = ease(t)
        local a, b = tween.from, tween.to
        Cam.pos = v(a.pos.x + (b.pos.x - a.pos.x) * k, a.pos.y + (b.pos.y - a.pos.y) * k, a.pos.z + (b.pos.z - a.pos.z) * k)
        Cam.rot = v(a.rot.x + wrap(b.rot.x - a.rot.x) * k, a.rot.y + wrap(b.rot.y - a.rot.y) * k, a.rot.z + wrap(b.rot.z - a.rot.z) * k)
        Cam.fov = a.fov + (b.fov - a.fov) * k
        if t >= 1.0 then tween = nil end
      else
        -- Computes mouse rotation deltas.
        if look.x ~= 0.0 or look.y ~= 0.0 then
          target.rot.z = target.rot.z - look.x * 0.12
          target.rot.x = Util.clamp(target.rot.x - look.y * 0.12, -89.0, 89.0)
          look.x, look.y = 0.0, 0.0
          orbitCenter = nil
        end
        local k = 1.0 - math.exp(-dt * 18.0)
        Cam.rot = v(Cam.rot.x + wrap(target.rot.x - Cam.rot.x) * k, Cam.rot.y + wrap(target.rot.y - Cam.rot.y) * k, Cam.rot.z + wrap(target.rot.z - Cam.rot.z) * k)
        Cam.fov = Cam.fov + (target.fov - Cam.fov) * k
        -- Applies directional keyboard velocity.
        local right, fwd = Rot.basis(Cam.rot)
        local mult = held.fast and 4.0 or held.slow and 0.2 or 1.0
        local want = v(0.0, 0.0, 0.0)
        want = add(want, fwd, held.f)
        want = add(want, right, held.r)
        want.z = want.z + held.u
        local wl = len(want)
        if wl > 0 then want = v(want.x / wl * speed * mult, want.y / wl * speed * mult, want.z / wl * speed * mult) end
        local a = 1.0 - math.exp(-dt * 9.0)
        vel = v(vel.x + (want.x - vel.x) * a, vel.y + (want.y - vel.y) * a, vel.z + (want.z - vel.z) * a)
        if len(vel) > 0.001 then
          Cam.pos = add(Cam.pos, vel, dt)
          if wl > 0 then orbitCenter = nil end
        end
      end
      SetCamCoord(cam, Cam.pos.x, Cam.pos.y, Cam.pos.z)
      SetCamRot(cam, Cam.rot.x, Cam.rot.y, Cam.rot.z, 2)
      SetCamFov(cam, Cam.fov)
      if not (Studio and Studio.active and (Config.Studio.disable or {}).focus) then SetFocusPosAndVel(Cam.pos.x, Cam.pos.y, Cam.pos.z, 0.0, 0.0, 0.0) end
      if dof and dof.on then
        SetCamUseShallowDofMode(cam, true)
        SetCamNearDof(cam, dof.near or 0.5)
        SetCamFarDof(cam, dof.far or 6.0)
        SetCamDofStrength(cam, dof.strength or 1.0)
        SetUseHiDof()
      else
        SetCamUseShallowDofMode(cam, false)
      end
      HideHudAndRadarThisFrame()
      if now - lastSend >= 1000 / E.frameRate then
        lastSend = now
        UI.send('cam', { p = { Cam.pos.x, Cam.pos.y, Cam.pos.z }, r = { Cam.rot.x, Cam.rot.y, Cam.rot.z }, f = Cam.fov, s = speed })
      end
      Wait(0)
    else
      Wait(200)
    end
  end
end)

AddEventHandler('onResourceStop', function(name)
  if name == Util.RESOURCE then Cam.stop() end
end)
