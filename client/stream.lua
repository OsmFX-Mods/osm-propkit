-- Prop streaming manager handling local instancing and networked entity synchronization.
Stream = { live = {}, editing = {}, queue = {}, queued = {}, bad = {}, highlighted = nil }

local CFG = Config.Stream

-- Returns coordinates of active camera or player ped for distance calculations.
function Stream.focus()
  if Cam and Cam.active then return Cam.pos end
  local c = GetEntityCoords(PlayerPedId())
  return { x = c.x, y = c.y, z = c.z }
end

local function sig(p, s)
  return Util.hash({ s.model, p.pos, p.rot, s.freeze, s.collision, s.alpha, s.lod, p.anchor and p.anchor.offset, p.anchor and p.anchor.local_rot, p.interior })
end

-- Resolves coordinates and rotation relative to an anchor object.
local function resolve(p)
  local a = p.anchor
  if not a then return p.pos, p.rot, false end
  local hash = type(a.model) == 'number' and a.model or tonumber(a.model) or joaat(a.model)
  local obj = GetClosestObjectOfType(a.pos.x, a.pos.y, a.pos.z, a.radius or 1.5, hash, false, false, false)
  if obj == 0 then return p.pos, p.rot, true end
  local c, r = GetEntityCoords(obj), GetEntityRotation(obj, 2)
  local pos, rot = Rot.compose({ x = c.x, y = c.y, z = c.z }, { x = r.x, y = r.y, z = r.z }, a.offset, a.local_rot)
  return pos, rot, false
end
Stream.resolve = resolve

-- Forces interior room association to ensure rendering inside MLO spaces.
local function seatInterior(e, p)
  if not p.interior then return end
  local int = GetInteriorAtCoordsWithTypehash(p.pos.x, p.pos.y, p.pos.z, p.interior.hash)
  if int == 0 or not IsValidInterior(int) then return end
  if not IsInteriorReady(int) then
    PinInteriorInMemory(int)
    local t = GetGameTimer() + 2000
    while not IsInteriorReady(int) and GetGameTimer() < t do Wait(50) end
  end
  if DoesEntityExist(e) then ForceRoomForEntity(e, int, p.interior.room) end
end

-- Applies position, rotation, collision, freeze state, and visual properties to an entity.
function Stream.apply(e, pos, rot, s)
  SetEntityCoordsNoOffset(e, pos.x, pos.y, pos.z, false, false, false)
  SetEntityRotation(e, rot.x, rot.y, rot.z, 2, false)
  FreezeEntityPosition(e, s.freeze ~= false)
  SetEntityCollision(e, s.collision ~= false, s.collision ~= false)
  if s.invincible ~= false then
    SetEntityInvincible(e, true)
    SetEntityCanBeDamaged(e, false)
  end
  SetEntityLodDist(e, math.floor(s.lod or CFG.defaultLod))
  if s.alpha and s.alpha < 255 then SetEntityAlpha(e, s.alpha, false) else ResetEntityAlpha(e) end
end

function Stream.loadModel(model)
  local hash = type(model) == 'number' and model or joaat(model)
  if not IsModelInCdimage(hash) then return nil, 'missing' end
  if HasModelLoaded(hash) then return hash end
  RequestModel(hash)
  local t = GetGameTimer() + CFG.modelTimeout
  while not HasModelLoaded(hash) and GetGameTimer() < t do Wait(0) end
  return HasModelLoaded(hash) and hash or nil, 'timeout'
end

local function despawn(id)
  local l = Stream.live[id]
  if not l then return end
  Interact.detach(id)
  if not l.net and DoesEntityExist(l.entity) then DeleteEntity(l.entity) end
  if Stream.highlighted == id then Stream.highlighted = nil end
  Stream.live[id] = nil
end
Stream.despawn = despawn

local function spawn(id)
  local p = State.placements[id]
  if not p then return end
  local s = State.settings(p)
  local hash, err = Stream.loadModel(s.model)
  if not hash then
    if err == 'missing' then
      Stream.bad[s.model] = true
      print(('^3[propkit]^7 model %s is not in the game files (placement %s)'):format(s.model, id))
    end
    return
  end
  if Stream.live[id] or not State.placements[id] then return end
  local pos, rot, pending = resolve(p)
  local e = CreateObjectNoOffset(hash, pos.x, pos.y, pos.z, false, false, false)
  SetModelAsNoLongerNeeded(hash)
  if e == 0 then return end
  Stream.apply(e, pos, rot, s)
  Stream.live[id] = { entity = e, sig = sig(p, s), anchorPending = pending }
  seatInterior(e, p)
  Interact.attach(id, e)
end

-- Evaluates spatial streaming distance thresholds and queues spawn or despawn actions.
local function pass()
  local f = Stream.focus()
  local H = CFG.hysteresis
  for id, p in pairs(State.placements) do
    local s = State.settings(p)
    local want = p.enabled ~= false and not p.hidden and not Stream.editing[id] and not Stream.bad[s.model]
    local l = Stream.live[id]
    if s.mode == 'networked' then
      if l and not l.net then despawn(id) l = nil end
      local e = want and p.netId and NetworkDoesNetworkIdExist(p.netId) and NetToObj(p.netId) or 0
      if e ~= 0 and DoesEntityExist(e) then
        if not l or l.entity ~= e then
          if l then despawn(id) end
          Stream.live[id] = { entity = e, net = true }
          SetEntityLodDist(e, math.floor(s.lod or CFG.defaultLod))
          seatInterior(e, p)
          Interact.attach(id, e)
        end
      elseif l then
        despawn(id)
      end
    else
      if l and l.net then despawn(id) l = nil end
      local d = Util.dist(f, p.pos)
      if not want then
        if l then despawn(id) end
      elseif l then
        if d > s.distance + H or not DoesEntityExist(l.entity) then despawn(id)
        elseif l.sig ~= sig(p, s) then despawn(id) Stream.enqueue(id)
        elseif l.anchorPending then
          local pos, rot, pending = resolve(p)
          if not pending then
            Stream.apply(l.entity, pos, rot, s)
            l.anchorPending = false
            Interact.attach(id, l.entity)
          end
        end
      elseif d <= s.distance then
        Stream.enqueue(id)
      end
    end
  end
  for id in pairs(Stream.live) do
    if not State.placements[id] then despawn(id) end
  end
end

function Stream.enqueue(id)
  if Stream.queued[id] then return end
  Stream.queued[id] = true
  Stream.queue[#Stream.queue + 1] = id
end

CreateThread(function()
  while not State.ready do Wait(200) end
  while true do
    pass()
    Wait(CFG.tick)
  end
end)

CreateThread(function()
  while true do
    if #Stream.queue > 0 then
      for _ = 1, CFG.perFrame do
        local id = table.remove(Stream.queue, 1)
        if not id then break end
        Stream.queued[id] = nil
        if not Stream.live[id] then spawn(id) end
      end
      Wait(0)
    else
      Wait(100)
    end
  end
end)

-- Triggers an immediate streaming pass when server state updates.
State.on(function(kind)
  if kind == 'models' then
    for id, l in pairs(Stream.live) do
      if not l.net then l.sig = '' end
    end
  end
  if State.ready then pass() end
end)

-- Toggles entity outline highlighting for administrative UI inspection.
function Stream.highlight(id)
  local prev = Stream.highlighted and Stream.live[Stream.highlighted]
  if prev and DoesEntityExist(prev.entity) then SetEntityDrawOutline(prev.entity, false) end
  Stream.highlighted = nil
  local l = id and Stream.live[id]
  if l and DoesEntityExist(l.entity) then
    local c = Config.Editor.outline
    SetEntityDrawOutlineColor(c[1], c[2], c[3], c[4])
    SetEntityDrawOutlineShader(1)
    SetEntityDrawOutline(l.entity, true)
    Stream.highlighted = id
  end
end

function Stream.entityOf(id)
  local l = Stream.live[id]
  return l and DoesEntityExist(l.entity) and l.entity or nil
end

-- Temporarily despawns live entity while being modified in editor mode.
function Stream.hold(id, on)
  Stream.editing[id] = on or nil
  if on then despawn(id) end
end

AddEventHandler('onResourceStop', function(name)
  if name ~= Util.RESOURCE then return end
  for id, l in pairs(Stream.live) do
    if not l.net and DoesEntityExist(l.entity) then DeleteEntity(l.entity) end
  end
end)
