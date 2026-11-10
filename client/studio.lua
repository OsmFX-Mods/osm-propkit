-- Studio staging controller managing local entities, backdrop, lighting, and capture passes.
Studio = { active = false }

local EVENT = Util.EVENT
local S -- session: { scene, items = { id = { kind, entity, fx, sig } }, ped = { pos, heading, visible }, dui, matte, weatherAt }

local function v(x, y, z) return { x = x + 0.0, y = y + 0.0, z = z + 0.0 } end

local function rgb(hex, fallback)
  if type(hex) ~= 'string' then return fallback or { 255, 255, 255 } end
  local h = hex:gsub('#', '')
  if #h == 3 then h = h:sub(1, 1):rep(2) .. h:sub(2, 2):rep(2) .. h:sub(3, 3):rep(2) end
  local r, g, b = tonumber(h:sub(1, 2), 16), tonumber(h:sub(3, 4), 16), tonumber(h:sub(5, 6), 16)
  if not (r and g and b) then return fallback or { 255, 255, 255 } end
  return { r, g, b }
end

-- Stage entity and particle management.

local function deleteItem(it)
  if not it then return end
  if it.fx then StopParticleFxLooped(it.fx, false) end
  if it.entity and DoesEntityExist(it.entity) then DeleteEntity(it.entity) end
end

local function playPed(e, d)
  ClearPedTasksImmediately(e)
  if d.scenario and d.scenario ~= '' then
    TaskStartScenarioInPlace(e, d.scenario, 0, true)
  elseif d.anim and d.anim.dict and d.anim.clip then
    if lib.requestAnimDict(d.anim.dict, 3000) then
      TaskPlayAnim(e, d.anim.dict, d.anim.clip, 8.0, -8.0, -1, d.anim.flag or 1, d.anim.phase or 0.0, false, false, false)
    end
  end
end

local function place(e, d)
  SetEntityCoordsNoOffset(e, d.pos.x, d.pos.y, d.pos.z, false, false, false)
  SetEntityRotation(e, d.rot.x, d.rot.y, d.rot.z, 2, false)
end

local function makeProp(d)
  local hash = Stream.loadModel(d.model)
  if not hash then return nil end
  local e = CreateObjectNoOffset(hash, d.pos.x, d.pos.y, d.pos.z, false, false, false)
  SetModelAsNoLongerNeeded(hash)
  place(e, d)
  FreezeEntityPosition(e, true)
  SetEntityCollision(e, true, true)
  SetEntityInvincible(e, true)
  SetEntityLodDist(e, 2000)
  return e
end

local function makePed(d)
  local e
  if d.clone then
    e = ClonePed(PlayerPedId(), false, false, true)
    SetEntityVisible(e, true, false)
  else
    local hash = Stream.loadModel(d.model or 'a_m_y_business_01')
    if not hash then return nil end
    e = CreatePed(4, hash, d.pos.x, d.pos.y, d.pos.z, d.rot.z, false, false)
    SetModelAsNoLongerNeeded(hash)
  end
  place(e, d)
  FreezeEntityPosition(e, true)
  SetEntityCollision(e, false, false)
  SetEntityInvincible(e, true)
  SetBlockingOfNonTemporaryEvents(e, true)
  SetPedCanRagdoll(e, false)
  SetEntityLodDist(e, 2000)
  playPed(e, d)
  return e
end

local function startFx(d)
  local effect = d.effect or d.name
  if not effect or effect == '' then return nil end
  local asset = d.asset or 'core'
  if not HasNamedPtfxAssetLoaded(asset) then
    RequestNamedPtfxAsset(asset)
    local t = GetGameTimer() + 3000
    while not HasNamedPtfxAssetLoaded(asset) and GetGameTimer() < t do Wait(0) end
    if not HasNamedPtfxAssetLoaded(asset) then return nil end
  end
  UseParticleFxAssetNextCall(asset)
  local fx = StartParticleFxLoopedAtCoord(effect, d.pos.x, d.pos.y, d.pos.z, d.rot.x, d.rot.y, d.rot.z, d.scale or 1.0, false, false, false, false)
  if fx and fx ~= 0 then
    if d.color then local c = rgb(d.color) SetParticleFxLoopedColour(fx, c[1] / 255, c[2] / 255, c[3] / 255, false) end
    if d.alpha then SetParticleFxLoopedAlpha(fx, d.alpha) end
  end
  return fx
end

local function itemSig(d)
  if d.kind == 'prop' then return Util.hash({ d.model, d.visible }) end
  if d.kind == 'ped' then return Util.hash({ d.model, d.clone, d.anim, d.scenario, d.visible }) end
  if d.kind == 'fx' then return Util.hash({ d.asset, d.effect, d.scale, d.color, d.alpha, d.pos, d.rot, d.visible }) end
  return ''
end

-- Synchronizes stage items, peds, and particle effects with UI scene data.
local function reconcile(scene)
  local want = {}
  for _, d in ipairs(scene.items or {}) do
    d.pos = Util.vec(d.pos, v(0, 0, 0))
    d.rot = Util.vec(d.rot, v(0, 0, 0))
    want[d.id] = d
    local it = S.items[d.id]
    local sig = itemSig(d)
    if it and (it.kind ~= d.kind or it.sig ~= sig) then deleteItem(it) it = nil S.items[d.id] = nil end
    if not it and d.visible ~= false then
      it = { kind = d.kind, sig = sig }
      if d.kind == 'prop' then it.entity = makeProp(d)
      elseif d.kind == 'ped' then it.entity = makePed(d)
      elseif d.kind == 'fx' then it.fx = startFx(d) end
      S.items[d.id] = it
    end
    if it then
      it.data = d
      if it.entity and DoesEntityExist(it.entity) then
        place(it.entity, d)
        if d.alpha and d.alpha < 255 then SetEntityAlpha(it.entity, d.alpha, false) else ResetEntityAlpha(it.entity) end
      end
    end
  end
  for id, it in pairs(S.items) do
    if not want[id] or want[id].visible == false then deleteItem(it) S.items[id] = nil end
  end
  S.want = want
end

-- Environmental time, weather, and timecycle management.

local function applyLook(env)
  local look = env.look or {}
  if look.name and look.name ~= '' then
    SetTimecycleModifier(look.name)
    SetTimecycleModifierStrength(look.strength or 1.0)
  else
    ClearTimecycleModifier()
  end
end

local function applyWeather(env)
  if (Config.Studio.disable or {}).weather then return end
  if env.weather and env.weather ~= '' then
    ClearOverrideWeather()
    ClearWeatherTypePersist()
    SetWeatherTypeOvertimePersist(env.weather, 0.0)
    SetWeatherTypeNow(env.weather)
    SetWeatherTypeNowPersist(env.weather)
    SetOverrideWeather(env.weather)
  end
end

-- Manages hidden player ped state to maintain local world streaming focus.
local function parkPed(scene)
  local ped = PlayerPedId()
  local env = scene.env or {}
  if env.parkPed == false or (Config.Studio.disable or {}).parkPed then
    SetEntityVisible(ped, true, false)
    return
  end
  local o = scene.stage and scene.stage.origin
  if not o then return end
  -- Places the studio set at the player's current location to preserve map streaming.
  SetEntityVisible(ped, false, false)
  SetEntityCollision(ped, false, false)
  FreezeEntityPosition(ped, true)
end

-- Renders DUI browser textures onto an in-world backdrop surface.
local function ensureBoard(b)
  if not b then return end
  if not S.dui then
    S.dui = CreateDui(('nui://%s/html/index.html?board=1'):format(Util.RESOURCE), 1920, 1080)
    local txd = CreateRuntimeTxd('propkit_board')
    CreateRuntimeTextureFromDuiHandle(txd, 'board', GetDuiHandle(S.dui))
    S.duiReady = GetGameTimer() + 600
  end
  local payload = json.encode(b)
  if payload ~= S.boardSent then
    S.boardSent = payload
    SetTimeout(math.max(0, S.duiReady - GetGameTimer()), function()
      if S and S.dui then SendDuiMessage(S.dui, payload) end
    end)
  end
end

function Studio.sync(scene)
  if not S then return end
  local prev = S.scene or {}
  S.scene = scene
  reconcile(scene)
  local env, penv = scene.env or {}, prev.env or {}
  if json.encode(env.look or {}) ~= json.encode(penv.look or {}) then applyLook(env) end
  if env.weather ~= penv.weather then applyWeather(env) end
  local st, pst = scene.stage or {}, prev.stage or {}
  if json.encode(st) ~= json.encode(pst) or env.parkPed ~= penv.parkPed then parkPed(scene) end
  for _, d in ipairs(scene.items or {}) do
    if d.kind == 'board' and d.visible ~= false then ensureBoard(d.board) end
  end
  if scene.camera then
    Cam.setFov(scene.camera.fov or Cam.fov)
    Cam.setRoll(scene.camera.roll or 0.0)
    local dof = scene.camera.dof
    if dof and dof.on then
      local f = dof.focus or 3.0
      local r = dof.range or 1.0
      Cam.setDof({ on = true, near = math.max(0.05, f - r), far = f + r, strength = dof.strength or 1.0 })
    else
      Cam.setDof(nil)
    end
  end
end

-- Studio rendering routines.

-- Renders low-poly textured quads for studio backdrop walls and floor.
local TXD = 'propkit_studio'
local tex = { ready = false, gradKey = nil }

local function ensureTextures()
  if tex.ready then return end
  local txd = CreateRuntimeTxd(TXD)
  tex.white = CreateRuntimeTexture(txd, 'white', 4, 4)
  for x = 0, 3 do for y = 0, 3 do SetRuntimeTexturePixel(tex.white, x, y, 255, 255, 255, 255) end end
  CommitRuntimeTexture(tex.white)
  tex.grad = CreateRuntimeTexture(txd, 'grad', 4, 64)
  tex.ready = true
end

-- Updates vertical gradient texture pixels.
local function paintGradient(top, bottom)
  local key = table.concat(top, ',') .. '|' .. table.concat(bottom, ',')
  if tex.gradKey == key then return end
  tex.gradKey = key
  for y = 0, 63 do
    local t = y / 63
    local r = math.floor(top[1] + (bottom[1] - top[1]) * t + 0.5)
    local g = math.floor(top[2] + (bottom[2] - top[2]) * t + 0.5)
    local bl = math.floor(top[3] + (bottom[3] - top[3]) * t + 0.5)
    for x = 0, 3 do SetRuntimeTexturePixel(tex.grad, x, y, r, g, bl, 255) end
  end
  CommitRuntimeTexture(tex.grad)
end

-- Renders a double-sided textured polygon quad.
local UV_TL, UV_TR, UV_BR, UV_BL = { 0.0, 0.0 }, { 1.0, 0.0 }, { 1.0, 1.0 }, { 0.0, 1.0 }
local function texQuad(a, b, c, d, col, txn)
  local function tri(p1, u1, p2, u2, p3, u3)
    DrawSpritePoly(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, col[1], col[2], col[3], 255, TXD, txn,
      u1[1], u1[2], 1.0, u2[1], u2[2], 1.0, u3[1], u3[2], 1.0)
  end
  tri(a, UV_TL, b, UV_TR, c, UV_BR)
  tri(a, UV_TL, c, UV_BR, d, UV_BL)
  tri(c, UV_BR, b, UV_TR, a, UV_TL)
  tri(d, UV_BL, c, UV_BR, a, UV_TL)
end

-- Renders the closed backdrop box with camera culling.
local function drawBackdrop(scene)
  local b = scene.backdrop or {}
  local mode = S.matte or b.mode
  if not mode or mode == 'none' then return end
  local o = scene.stage and scene.stage.origin
  if not o then return end
  ensureTextures()
  local half = (b.size or 12.0) * 0.5
  local h = b.height or 8.0
  local z0 = o.z + (b.floorLift or 0.0)
  local z1 = z0 + h
  local bottom, top
  if mode == 'black' then bottom, top = { 0, 0, 0 }, { 0, 0, 0 }
  elseif mode == 'white' then bottom, top = { 255, 255, 255 }, { 255, 255, 255 }
  elseif mode == 'chroma' then bottom = rgb(b.chroma, { 0, 255, 0 }) top = bottom
  else bottom, top = rgb(b.bottom, { 30, 30, 34 }), rgb(b.top, { 12, 12, 14 }) end
  local x0, x1, y0, y1 = o.x - half, o.x + half, o.y - half, o.y + half
  -- Performs camera-relative backface culling on backdrop walls.
  local cp = Cam.pos
  if b.floor ~= false or S.matte then
    if cp.z > z0 then texQuad(v(x0, y1, z0), v(x1, y1, z0), v(x1, y0, z0), v(x0, y0, z0), bottom, 'white') end
  end
  if cp.z < z1 then texQuad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), top, 'white') end
  local same = bottom[1] == top[1] and bottom[2] == top[2] and bottom[3] == top[3]
  local wallTex, tint = 'white', bottom
  if not same then
    paintGradient(top, bottom)
    wallTex, tint = 'grad', { 255, 255, 255 }
  end
  if cp.y > y0 then texQuad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y0, z0), v(x0, y0, z0), tint, wallTex) end
  if cp.x < x1 then texQuad(v(x1, y0, z1), v(x1, y1, z1), v(x1, y1, z0), v(x1, y0, z0), tint, wallTex) end
  if cp.y < y1 then texQuad(v(x1, y1, z1), v(x0, y1, z1), v(x0, y1, z0), v(x1, y1, z0), tint, wallTex) end
  if cp.x > x0 then texQuad(v(x0, y1, z1), v(x0, y0, z1), v(x0, y0, z0), v(x0, y1, z0), tint, wallTex) end
end

local function drawBoard(d)
  if not S.dui then return end
  local w, h = (d.size and d.size.w or 6.0) * 0.5, (d.size and d.size.h or 3.375) * 0.5
  local right, _, up = Rot.basis(d.rot)
  local p = d.pos
  local function corner(sx, sz) return v(p.x + right.x * w * sx + up.x * h * sz, p.y + right.y * w * sx + up.y * h * sz, p.z + right.z * w * sx + up.z * h * sz) end
  -- Orients DUI board quad vertices to prevent mirrored texture rendering.
  local tl, tr, br, bl = corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)
  local a = d.alpha or 255
  local function tri(p1, uv1, p2, uv2, p3, uv3)
    DrawSpritePoly(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z, 255, 255, 255, a, 'propkit_board', 'board',
      uv1[1], uv1[2], 1.0, uv2[1], uv2[2], 1.0, uv3[1], uv3[2], 1.0)
  end
  local TL, TR, BR, BL = { 0.0, 0.0 }, { 1.0, 0.0 }, { 1.0, 1.0 }, { 0.0, 1.0 }
  tri(tl, TL, tr, TR, br, BR)
  tri(tl, TL, br, BR, bl, BL)
  -- Renders reverse face of DUI board.
  tri(br, BR, tr, TR, tl, TL)
  tri(bl, BL, br, BR, tl, TL)
end

local function drawLight(d, n)
  local c = rgb(d.color)
  local p = d.pos
  local intensity = d.intensity or 4.0
  local range = d.range or 8.0
  if d.type == 'point' then
    if d.shadow then DrawLightWithRangeAndShadow(p.x, p.y, p.z, c[1], c[2], c[3], range, intensity, 1.0)
    else DrawLightWithRange(p.x, p.y, p.z, c[1], c[2], c[3], range, intensity) end
    return
  end
  local dir
  if d.aim ~= false and S.aimAt then
    local t = S.aimAt
    local dx, dy, dz = t.x - p.x, t.y - p.y, t.z - p.z
    local l = math.sqrt(dx * dx + dy * dy + dz * dz)
    dir = l > 0.001 and v(dx / l, dy / l, dz / l) or v(0, 0, -1)
  else
    local _, fwd = Rot.basis(d.rot)
    dir = fwd
  end
  -- Configures spot light parameters including beam angle, edge softness, and falloff.
  local cone = Util.clamp(d.angle or 35.0, 1.0, 90.0)
  local roundness = Util.clamp((d.softness or 0.4) * 2.0, 0.0, 4.0)
  local falloff = Util.clamp(d.falloff or 6.0, 0.5, 20.0)
  if d.shadow then
    -- Enables shadow casting with hardware engine budgeting.
    DrawSpotLightWithShadow(p.x, p.y, p.z, dir.x, dir.y, dir.z, c[1], c[2], c[3], range, intensity, roundness, cone, falloff, 0)
  else
    DrawSpotLight(p.x, p.y, p.z, dir.x, dir.y, dir.z, c[1], c[2], c[3], range, intensity, roundness, cone, falloff)
  end
end

CreateThread(function()
  while true do
    if S and S.scene then
      local scene = S.scene
      local env = scene.env or {}
      -- Resolves target center coordinates for directional lights.
      S.aimAt = nil
      for _, d in ipairs(scene.items or {}) do
        if d.subject and d.visible ~= false then
          local it = S.items[d.id]
          local e = it and it.entity
          if e and DoesEntityExist(e) then
            local mn, mx = GetModelDimensions(GetEntityModel(e))
            S.aimAt = GetOffsetFromEntityInWorldCoords(e, (mn.x + mx.x) * 0.5, (mn.y + mx.y) * 0.5, (mn.z + mx.z) * 0.5)
          else
            S.aimAt = d.pos
          end
          break
        end
      end
      local off = Config.Studio.disable or {}
      if env.time and not off.clock then NetworkOverrideClockTime(env.time.h or 12, env.time.m or 0, 0) end
      -- Applies configurable level-of-detail scaling.
      local lod = math.min(tonumber(env.lodScale) or Config.Studio.lodScale, Config.Studio.maxLodScale or 1.25)
      if lod > 1.001 and not off.lod then OverrideLodscaleThisFrame(lod) end
      if not off.backdrop then drawBackdrop(scene) end
      local n = 0
      for _, d in ipairs(scene.items or {}) do
        if d.visible ~= false and not (S.matte and d.kind == 'board' and S.matte ~= 'chroma') then
          if d.kind == 'light' then n = n + 1 if n <= 16 and not off.lights then drawLight(d, n) end
          elseif d.kind == 'board' then drawBoard(d) end
        end
      end
      -- Validates and restarts ped animation loops.
      local now = GetGameTimer()
      if not S.pedCheck or now > S.pedCheck then
        S.pedCheck = now + 1500
        for id, it in pairs(S.items) do
          local d = it.data
          if it.kind == 'ped' and d and it.entity and DoesEntityExist(it.entity) and d.anim and d.anim.dict and not d.scenario then
            if not IsEntityPlayingAnim(it.entity, d.anim.dict, d.anim.clip, 3) then playPed(it.entity, d) end
          end
        end
        if env.weather and env.weather ~= '' and not off.weather and (not S.weatherAt or now > S.weatherAt) then
          S.weatherAt = now + 5000
          SetWeatherTypeNowPersist(env.weather)
        end
      end
      Wait(0)
    else
      Wait(300)
    end
  end
end)

-- Diagnostic command rendering a temporary test spotlight.
RegisterCommand('propkit_lighttest', function()
  local ped = PlayerPedId()
  local until_ = GetGameTimer() + 12000
  CreateThread(function()
    while GetGameTimer() < until_ do
      local at = GetOffsetFromEntityInWorldCoords(ped, 0.0, 3.0, 2.5)
      local to = GetOffsetFromEntityInWorldCoords(ped, 0.0, 3.0, 0.0)
      local dx, dy, dz = to.x - at.x, to.y - at.y, to.z - at.z
      DrawSpotLight(at.x, at.y, at.z, dx / 2.5, dy / 2.5, dz / 2.5, 255, 236, 210, 8.0, 6.0, 0.35, 30.0, 6.0)
      DrawLightWithRange(at.x, at.y - 2.0, at.z, 120, 160, 255, 5.0, 2.0)
      Wait(0)
    end
  end)
end, false)

-- Studio session lifecycle management.

function Studio.start(opts)
  if Studio.active or Editor.active then return end
  opts = opts or {}
  local ped = PlayerPedId()
  if IsPedInAnyVehicle(ped, false) then return UI.toast(Locale.inVehicle, 'error') end
  local c = GetEntityCoords(ped)
  local heading = GetEntityHeading(ped)
  S = { items = {}, ped = { pos = v(c.x, c.y, c.z), heading = heading } }
  Studio.active = true
  Cam.fromGameplay()
  local fwd = GetEntityForwardVector(ped)
  local front = v(c.x + fwd.x * 2.5, c.y + fwd.y * 2.5, c.z)
  local ok, gz = GetGroundZFor_3dCoord(front.x, front.y, front.z + 1.0, false)
  UI.open('studio', {
    here = { pos = v(front.x, front.y, ok and gz or c.z - 1.0), heading = heading },
    void = v(front.x, front.y, ok and gz or c.z - 1.0),
    model = opts.model, scene = opts.scene,
    lodScale = Config.Studio.lodScale, parkPed = Config.Studio.parkPed,
  })
end

function Studio.stop()
  if not S then return end
  for _, it in pairs(S.items) do deleteItem(it) end
  if S.dui then DestroyDui(S.dui) end
  ClearTimecycleModifier()
  ClearOverrideWeather()
  ClearWeatherTypePersist()
  NetworkClearClockTimeOverride()
  local ped = PlayerPedId()
  SetEntityCoordsNoOffset(ped, S.ped.pos.x, S.ped.pos.y, S.ped.pos.z, false, false, false)
  SetEntityHeading(ped, S.ped.heading)
  SetEntityVisible(ped, true, false)
  SetEntityCollision(ped, true, true)
  FreezeEntityPosition(ped, false)
  Cam.stop()
  S = nil
  Studio.active = false
  UI.close()
end

-- NUI studio callbacks.

RegisterNUICallback('studio:sync', function(d, cb)
  cb(true)
  if S and type(d.scene) == 'table' then Studio.sync(d.scene) end
end)

-- Updates individual item transform during interactive gizmo dragging.
RegisterNUICallback('studio:item', function(d, cb)
  cb(true)
  if not (S and S.want) then return end
  local want = S.want[d.id]
  if not want then return end
  want.pos = Util.vec(d.pos, want.pos)
  want.rot = Util.vec(d.rot, want.rot)
  local it = S.items[d.id]
  if it and it.entity and DoesEntityExist(it.entity) then place(it.entity, want) end
  if it and it.kind == 'fx' and it.fx then
    SetParticleFxLoopedOffsets(it.fx, want.pos.x, want.pos.y, want.pos.z, want.rot.x, want.rot.y, want.rot.z)
  end
end)

RegisterNUICallback('studio:dims', function(d, cb)
  local hash = Stream.loadModel(d.model)
  if not hash then return cb({ ok = false, msg = Locale.noModel }) end
  local mn, mx = GetModelDimensions(hash)
  cb({ ok = true, min = v(mn.x, mn.y, mn.z), max = v(mx.x, mx.y, mx.z) })
end)

-- Raycasts against studio items to select objects in the viewport.
RegisterNUICallback('studio:pick', function(d, cb)
  if not S then return cb({ hit = false }) end
  local o, dir = Util.vec(d.o), Util.vec(d.d)
  if not (o and dir) then return cb({ hit = false }) end
  local ignore = 0
  if d.ignore and S.items[d.ignore] and S.items[d.ignore].entity then ignore = S.items[d.ignore].entity end
  local h = StartExpensiveSynchronousShapeTestLosProbe(o.x, o.y, o.z, o.x + dir.x * 200.0, o.y + dir.y * 200.0, o.z + dir.z * 200.0, -1, ignore, 7)
  local _, hit, pos, normal, ent = GetShapeTestResult(h)
  if hit ~= 1 then return cb({ hit = false }) end
  local out = { hit = true, pos = v(pos.x, pos.y, pos.z), normal = v(normal.x, normal.y, normal.z) }
  for id, it in pairs(S.items) do if it.entity == ent then out.id = id end end
  cb(out)
end)

-- Drops a studio item to rest flush on the surface below.
RegisterNUICallback('studio:ground', function(d, cb)
  if not S then return cb({ ok = false }) end
  local it = S.items[d.id]
  local want = S.want and S.want[d.id]
  if not want then return cb({ ok = false }) end
  local p = want.pos
  local ignore = it and it.entity or 0
  local h = StartExpensiveSynchronousShapeTestLosProbe(p.x, p.y, p.z + 1.0, p.x, p.y, p.z - 50.0, 1 | 16, ignore, 7)
  local _, hit, at = GetShapeTestResult(h)
  local z
  if hit == 1 then z = at.z
  else
    local o = S.scene and S.scene.stage and S.scene.stage.origin
    z = o and o.z or p.z
  end
  local low = 0.0
  if it and it.entity and DoesEntityExist(it.entity) and want.kind == 'prop' then
    local mn, mx = GetModelDimensions(GetEntityModel(it.entity))
    local right, fwd, up = Rot.basis(want.rot)
    low = math.huge
    for _, x in ipairs({ mn.x, mx.x }) do for _, y in ipairs({ mn.y, mx.y }) do for _, zz in ipairs({ mn.z, mx.z }) do
      local wz = right.z * x + fwd.z * y + up.z * zz
      if wz < low then low = wz end
    end end end
  end
  cb({ ok = true, pos = Util.pos(v(p.x, p.y, z - low)) })
end)

-- Overrides backdrop rendering for two-pass matte or chroma key capture.
RegisterNUICallback('studio:matte', function(d, cb)
  if S then S.matte = d.mode end
  cb(true)
end)

RegisterNUICallback('studio:exit', function(_, cb)
  cb(true)
  Studio.stop()
end)

-- Sets studio camera position, rotation, and field of view.
RegisterNUICallback('studio:cam', function(d, cb)
  cb(true)
  local pos, rot = Util.vec(d.pos), Util.vec(d.rot)
  if not (pos and rot) then return end
  if d.ease and d.ease > 0 then Cam.tween(pos, rot, tonumber(d.fov), d.ease)
  else Cam.set(pos, rot, tonumber(d.fov)) end
  if d.center then Cam.setOrbitCenter(Util.vec(d.center)) end
end)

-- Starts camera cinematic path playback.
RegisterNUICallback('studio:play', function(d, cb)
  cb(true)
  local keys = {}
  for _, k in ipairs(d.keys or {}) do
    local pos, rot = Util.vec(k.pos), Util.vec(k.rot)
    if pos and rot then keys[#keys + 1] = { t = tonumber(k.t) or 0, pos = pos, rot = rot, fov = tonumber(k.fov), ease = k.ease } end
  end
  Cam.play(keys, d.loop == true)
end)

RegisterNUICallback('studio:stop', function(_, cb)
  cb(true)
  Cam.stopPath()
end)

-- Capture upload transport handlers.

RegisterNUICallback('studio:upload:begin', function(d, cb)
  cb(lib.callback.await(EVENT .. 'shot:begin', false, d) or { ok = false })
end)

RegisterNUICallback('studio:upload:chunk', function(d, cb)
  TriggerLatentServerEvent(EVENT .. 'shot:chunk', 2000000, d.id, d.i, d.data)
  cb(true)
end)

RegisterNetEvent(EVENT .. 'shot:done', function(id, res)
  res.id = id
  UI.send('studio:shot', res)
end)

RegisterNetEvent(EVENT .. 'shot:uploaded', function(id, ok, link)
  UI.send('studio:uploaded', { id = id, ok = ok, url = link })
end)

AddEventHandler('onResourceStop', function(name)
  if name ~= Util.RESOURCE or not S then return end
  for _, it in pairs(S.items) do deleteItem(it) end
  if S.dui then DestroyDui(S.dui) end
  local ped = PlayerPedId()
  SetEntityVisible(ped, true, false)
  SetEntityCollision(ped, true, true)
  FreezeEntityPosition(ped, false)
  SetEntityCoordsNoOffset(ped, S.ped.pos.x, S.ped.pos.y, S.ped.pos.z, false, false, false)
  ClearTimecycleModifier()
  NetworkClearClockTimeOverride()
end)
