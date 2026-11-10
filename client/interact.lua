-- Client interaction executor and target option registration.
Interact = { handles = {}, models = {}, busy = false }

local EVENT = Util.EVENT
local SIDE = Schema.STEP_SIDE

local function serverSide(step)
  local s = SIDE[step.type]
  if s == 'server' then return true end
  if step.type == 'serverEvent' then return step.via == 'internal' end
  if step.type == 'export' then return step.side == 'server' end
  return false
end

-- Evaluates and caches player contextual eligibility for interaction conditions.
local ctxCache, ctxAt, counts = nil, 0, {}
local function ctx(p)
  local now = GetGameTimer()
  if not ctxCache or now - ctxAt > 1000 then
    ctxCache = { groups = Bridge.groups() }
    counts, ctxAt = {}, now
  end
  return {
    groups = ctxCache.groups,
    count = function(item)
      if counts[item] == nil then counts[item] = Bridge.itemCount(item) end
      return counts[item]
    end,
    state = p and p.state or {},
    hour = GetClockHours(),
    inVehicle = IsPedInAnyVehicle(PlayerPedId(), false),
  }
end

-- Client-side step execution handlers.

local function playAnim(a)
  local ped = PlayerPedId()
  if a.scenario then
    TaskStartScenarioInPlace(ped, a.scenario, 0, true)
    return true
  end
  if not lib.requestAnimDict(a.dict, 3000) then return false end
  TaskPlayAnim(ped, a.dict, a.clip, 8.0, -8.0, -1, a.flag or 1, 0.0, false, false, false)
  RemoveAnimDict(a.dict)
  return true
end

local function pointOf(run)
  local e, i = run.entity, run.i
  if e and DoesEntityExist(e) then
    if i.point then return GetOffsetFromEntityInWorldCoords(e, i.point.x, i.point.y, i.point.z) end
    return GetEntityCoords(e)
  end
  return run.coords and vector3(run.coords.x, run.coords.y, run.coords.z) or GetEntityCoords(PlayerPedId())
end

local function payload(run, step)
  local c = pointOf(run)
  return {
    placement = run.ref.placement, model = run.model, interaction = run.i.id, label = run.i.label,
    entity = run.entity, coords = c, args = step.args,
  }
end

local CLIENT = {}

function CLIENT.progress(step)
  if Bridge.progress(step) then return true end
  return false, Locale.cancelled
end

function CLIENT.anim(step)
  if not playAnim(step.anim) then return false end
  if step.duration and step.duration > 0 then
    Wait(step.duration)
    ClearPedTasks(PlayerPedId())
  end
  return true
end

function CLIENT.wait(step) Wait(step.duration) return true end

function CLIENT.notify(step) Bridge.notify(step.text, step.kind) return true end

function CLIENT.sound(step)
  PlaySoundFrontend(-1, step.name, step.set, true)
  return true
end

function CLIENT.ptfx(step, run)
  local at = pointOf(run)
  CreateThread(function()
    if not HasNamedPtfxAssetLoaded(step.asset) then
      RequestNamedPtfxAsset(step.asset)
      local t = GetGameTimer() + 3000
      while not HasNamedPtfxAssetLoaded(step.asset) and GetGameTimer() < t do Wait(0) end
    end
    UseParticleFxAssetNextCall(step.asset)
    local fx = StartParticleFxLoopedAtCoord(step.name, at.x, at.y, at.z, 0.0, 0.0, 0.0, step.scale or 1.0, false, false, false, false)
    Wait(step.duration or 2000)
    StopParticleFxLooped(fx, false)
  end)
  return true
end

function CLIENT.clientEvent(step, run) TriggerEvent(step.name, payload(run, step)) return true end

function CLIENT.serverEvent(step, run) TriggerServerEvent(step.name, payload(run, step)) return true end

function CLIENT.command(step)
  if not Config.Interact.allowCommands then return false end
  ExecuteCommand(step.command)
  return true
end

function CLIENT.export(step, run)
  if not Config.Interact.allowExports then return false end
  local ok, res = pcall(function() return exports[step.resource][step.fn](nil, payload(run, step)) end)
  if not ok then print(('^3[propkit]^7 export %s:%s failed: %s'):format(step.resource, step.fn, tostring(res))) return false end
  return res ~= false
end

-- Executes an interaction step pipeline across client and server stages.
function Interact.run(ref, i, entity)
  if Interact.busy then return end
  Interact.busy = true
  local res = lib.callback.await(EVENT .. 'begin', false, ref, i.id)
  if not res or not res.ok then
    if res and res.msg then Bridge.notify(res.msg, 'error') end
    Interact.busy = false
    return
  end
  local run = { ref = ref, i = i, entity = entity, coords = ref.coords, model = ref.model or (State.placements[ref.placement] or {}).model }
  for n, step in ipairs(res.steps or {}) do
    local ok, msg
    if serverSide(step) then
      local r = lib.callback.await(EVENT .. 'step', false, res.token, n)
      ok, msg = r and r.ok, r and r.msg
    else
      local fn = CLIENT[step.type]
      if fn then ok, msg = fn(step, run) else ok = true end
    end
    if not ok then
      if msg then Bridge.notify(msg, 'error') elseif step.type ~= 'progress' then Bridge.notify(Locale.stepFailed, 'error') end
      break
    end
  end
  ClearPedTasks(PlayerPedId())
  lib.callback.await(EVENT .. 'finish', false, res.token)
  Interact.busy = false
end

-- Target option builders and registration.

local function optionsFor(ref, list, getPlacement)
  local out = {}
  for n, e in ipairs(list) do
    local i = e.i
    if i.enabled ~= false then
      out[#out + 1] = {
        name = ('propkit:%s:%s'):format(ref.placement or ref.model, i.id),
        label = i.label, icon = i.icon, iconColor = i.iconColor, description = i.description,
        distance = i.distance, point = i.point, radius = i.radius, bones = i.bones, order = n,
        canInteract = function()
          if Interact.busy then return false end
          local g = i.gates
          if not g or not g.hideIneligible then return true end
          local p = getPlacement and getPlacement() or nil
          return Gates.check(g, ctx(p))
        end,
        onSelect = function(entity, coords)
          local r = ref
          if ref.model and not ref.placement then
            local c = entity and DoesEntityExist(entity) and GetEntityCoords(entity) or coords
            r = { model = ref.model, coords = c and { x = c.x, y = c.y, z = c.z } }
          end
          CreateThread(function() Interact.run(r, i, entity) end)
        end,
      }
    end
  end
  return out
end

function Interact.attach(id, entity)
  Interact.detach(id)
  local p = State.placements[id]
  if not p then return end
  local list = State.interactionsOf(p)
  if #list == 0 then return end
  local opts = optionsFor({ placement = id }, list, function() return State.placements[id] end)
  if #opts == 0 then return end
  Interact.handles[id] = Target.addEntity(entity, opts)
end

function Interact.detach(id)
  local h = Interact.handles[id]
  if h then Target.removeEntity(h) end
  Interact.handles[id] = nil
end

-- Registers global model targets for world-placed instances.
local function refreshModels()
  for model, h in pairs(Interact.models) do
    Target.removeModel(h)
    Interact.models[model] = nil
  end
  for name, m in pairs(State.models) do
    if m.worldTargets and #(m.interactions or {}) > 0 then
      local list = {}
      for _, i in ipairs(m.interactions) do list[#list + 1] = { i = i } end
      local opts = optionsFor({ model = name }, list, nil)
      if #opts > 0 then Interact.models[name] = Target.addModel(name, opts) end
    end
  end
end

State.on(function(kind, up)
  if kind == 'reset' or kind == 'models' then
    refreshModels()
    for id, l in pairs(Stream.live) do
      if DoesEntityExist(l.entity) then Interact.attach(id, l.entity) end
    end
  elseif kind == 'placements' then
    for _, p in ipairs(up or {}) do
      local l = Stream.live[p.id]
      if l and DoesEntityExist(l.entity) then Interact.attach(p.id, l.entity) end
    end
  end
end)

-- Triggers interaction testing directly from the admin hub.
function Interact.test(placementId, iid)
  local p = State.placements[placementId]
  if not p then return false end
  for _, e in ipairs(State.interactionsOf(p)) do
    if e.i.id == iid then
      CreateThread(function() Interact.run({ placement = placementId }, e.i, Stream.entityOf(placementId)) end)
      return true
    end
  end
  return false
end

AddEventHandler('onResourceStop', function(name)
  if name ~= Util.RESOURCE then return end
  for id in pairs(Interact.handles) do Interact.detach(id) end
  for _, h in pairs(Interact.models) do Target.removeModel(h) end
end)
