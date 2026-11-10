-- Server-authoritative interaction runner validating rules, distance, cooldowns, and step timing.
Runner = { runs = {}, cooldowns = {} }

local EVENT = Util.EVENT
local SIDE = Schema.STEP_SIDE

local function serverSide(step)
  local s = SIDE[step.type]
  if s == 'server' then return true end
  if step.type == 'serverEvent' then return step.via == 'internal' end
  if step.type == 'export' then return step.side == 'server' end
  return false
end
Runner.serverSide = serverSide

-- Calculates minimum elapsed duration required before subsequent server steps can execute.
local function minTime(step)
  if step.type == 'progress' then return step.duration * Config.Interact.progressSlack end
  if step.type == 'wait' then return step.duration * Config.Interact.progressSlack end
  return 0
end

-- Resolves an interaction definition by placement or world model reference.
function Runner.find(ref, iid)
  if ref.placement then
    local p = Store.placements[ref.placement]
    if not p or p.enabled == false then return nil end
    local rt = Store.runtime[p.id]
    if rt and rt.hidden then return nil end
    for _, i in ipairs(p.interactions or {}) do
      if i.id == iid then return i, p end
    end
    if p.inherit ~= false then
      local prof = Store.models[Store.modelOf(p)] or Store.models[p.model]
      for _, i in ipairs(prof and prof.interactions or {}) do
        if i.id == iid then return i, p end
      end
    end
  elseif ref.model then
    local prof = Store.models[ref.model]
    if not prof or not prof.worldTargets then return nil end
    for _, i in ipairs(prof.interactions or {}) do
      if i.id == iid then return i, nil end
    end
  end
end

local function anchorPoint(i, p, ref)
  local base = p and p.pos or Util.vec(ref.coords)
  if not base then return nil end
  if p and i.point then return Rot.offset(p.pos, p.rot, i.point) end
  return base
end

local function ctxFor(src, p)
  local rt = p and Store.runtime[p.id]
  local ped = GetPlayerPed(src)
  return {
    groups = Bridge.groups(src),
    count = function(item) return Bridge.itemCount(src, item) end,
    state = rt and rt.state or {},
    hour = tonumber(os.date('%H')),
    inVehicle = ped ~= 0 and GetVehiclePedIsIn(ped, false) ~= 0,
  }
end

local function cooldownKey(src, i, p, ref)
  local scope = i.gates and i.gates.cooldownScope or 'player'
  local target = p and p.id or ref.model
  if scope == 'global' then return ('g:%s:%s'):format(target, i.id) end
  if scope == 'placement' then return ('p:%s:%s'):format(target, i.id) end
  return ('u:%s:%s:%s'):format(Bridge.identifier(src), target, i.id)
end

-- Session initiation callback validating preconditions and issuing execution tokens.

lib.callback.register(EVENT .. 'begin', function(src, ref, iid)
  if type(ref) ~= 'table' or type(iid) ~= 'string' then return { ok = false } end
  local i, p = Runner.find(ref, iid)
  if not i or i.enabled == false then return { ok = false, msg = Locale.invalid } end

  -- Ensures only one active interaction run per player.
  for token, run in pairs(Runner.runs) do
    if run.src == src then Runner.runs[token] = nil end
  end

  local ped = GetPlayerPed(src)
  local at = anchorPoint(i, p, ref)
  if not at or ped == 0 then return { ok = false } end
  local me = GetEntityCoords(ped)
  if Util.dist({ x = me.x, y = me.y, z = me.z }, at) > i.distance + Config.Interact.distanceSlack then
    return { ok = false, msg = Locale.tooFar }
  end
  if p and p.bucket and GetPlayerRoutingBucket(src) ~= p.bucket then return { ok = false } end

  local ctx = ctxFor(src, p)
  local ok, why = Gates.check(i.gates, ctx)
  if not ok then
    if why == 'item' then
      local item, n = Gates.missingItem(i.gates, ctx)
      return { ok = false, msg = Locale.missingItem:format(n or 1, item or '?') }
    end
    if why == 'vehicle' then return { ok = false, msg = Locale.inVehicle } end
    return { ok = false, msg = Locale.locked }
  end

  local g = i.gates or {}
  if g.cooldown then
    local key = cooldownKey(src, i, p, ref)
    local until_ = Runner.cooldowns[key]
    local now = os.time()
    if until_ and until_ > now then return { ok = false, msg = Locale.cooldown:format(until_ - now) } end
    Runner.cooldowns[key] = now + g.cooldown
  end

  local token = Util.id('run')
  Runner.runs[token] = {
    src = src, ref = ref, iid = iid, steps = i.steps, label = i.label,
    placement = p and p.id or nil, model = p and Store.modelOf(p) or ref.model,
    started = GetGameTimer(), lastServer = 0, at = at,
  }
  if Config.Interact.logRuns then
    print(('[propkit] %s (%s) began %s on %s'):format(GetPlayerName(src), src, iid, p and p.id or ref.model))
  end
  return { ok = true, token = token, steps = i.steps }
end)

-- Server step execution dispatchers.

local function payload(run, step)
  return {
    placement = run.placement, model = run.model, interaction = run.iid, label = run.label,
    coords = run.at, args = step.args,
  }
end

local EXEC = {}

function EXEC.giveItem(src, step)
  if Bridge.addItem(src, step.item, step.count, step.metadata) then return true end
  return false, 'Your pockets are full.'
end

function EXEC.removeItem(src, step)
  if Bridge.removeItem(src, step.item, step.count) then return true end
  return false, Locale.missingItem:format(step.count, step.item)
end

local function accountOk(account)
  for _, a in ipairs(Config.Interact.moneyAccounts) do if a == account then return true end end
  return false
end

function EXEC.giveMoney(src, step)
  if not accountOk(step.account) then return false end
  return Bridge.addMoney(src, step.account, step.amount)
end

function EXEC.removeMoney(src, step)
  if not accountOk(step.account) then return false end
  if Bridge.removeMoney(src, step.account, step.amount) then return true end
  return false, Locale.notEnoughMoney
end

function EXEC.serverEvent(src, step, run)
  TriggerEvent(step.name, src, payload(run, step))
  return true
end

function EXEC.export(src, step, run)
  if not Config.Interact.allowExports then return false end
  local ok, res = pcall(function() return exports[step.resource][step.fn](nil, src, payload(run, step)) end)
  if not ok then print(('^3[propkit]^7 export %s:%s failed: %s'):format(step.resource, step.fn, tostring(res))) return false end
  return res ~= false
end

function EXEC.setState(src, step, run)
  if not run.placement then return false end
  local rt = Store.runtime[run.placement] or {}
  local state = Util.copy(rt.state or {})
  if step.toggle then state[step.key] = not state[step.key] else state[step.key] = step.value end
  Store.setRuntime(run.placement, { state = state }, step.persist)
  return true
end

function EXEC.swapModel(src, step, run)
  if not run.placement then return false end
  local p = Store.placements[run.placement]
  if not p then return false end
  local rt = Store.runtime[p.id] or {}
  -- Reverts swapped model if target matches current swap.
  local target = step.model
  if rt.swap == step.model then target = false end
  Store.setRuntime(p.id, { swap = target }, step.persist)
  return true
end

function EXEC.pickup(src, step, run)
  if not run.placement then return false end
  if step.item and not Bridge.addItem(src, step.item, step.count or 1) then return false, 'Your pockets are full.' end
  local id = run.placement
  Store.setRuntime(id, { hidden = true })
  if step.respawn and step.respawn > 0 then
    SetTimeout(step.respawn * 1000, function()
      if Store.placements[id] then Store.setRuntime(id, { hidden = false }) end
    end)
  end
  return true
end

lib.callback.register(EVENT .. 'step', function(src, token, index)
  local run = Runner.runs[token]
  if not run or run.src ~= src then return { ok = false } end
  index = tonumber(index)
  local step = index and run.steps[index]
  if not step or not serverSide(step) or index <= run.lastServer then return { ok = false } end
  -- Validates minimum time elapsed from preceding client steps.
  local need = 0
  for n = 1, index - 1 do need = need + minTime(run.steps[n]) end
  if GetGameTimer() - run.started < need then
    print(('^3[propkit]^7 %s (%s) ran a step early on %s, ignored'):format(GetPlayerName(src), src, run.iid))
    Runner.runs[token] = nil
    return { ok = false }
  end
  -- Validates player proximity throughout execution.
  local ped = GetPlayerPed(src)
  local me = GetEntityCoords(ped)
  if Util.dist({ x = me.x, y = me.y, z = me.z }, run.at) > 15.0 then
    Runner.runs[token] = nil
    return { ok = false, msg = Locale.tooFar }
  end
  run.lastServer = index
  local fn = EXEC[step.type]
  if not fn then return { ok = false } end
  local ok, msg = fn(src, step, run)
  return { ok = ok and true or false, msg = msg }
end)

lib.callback.register(EVENT .. 'finish', function(src, token)
  local run = Runner.runs[token]
  if run and run.src == src then Runner.runs[token] = nil end
  return true
end)

-- Generates validated event payload containing server-verified coordinates.
lib.callback.register(EVENT .. 'payload', function(src, token, index)
  local run = Runner.runs[token]
  if not run or run.src ~= src then return nil end
  local step = run.steps[tonumber(index) or 0]
  return step and payload(run, step) or nil
end)

AddEventHandler('playerDropped', function()
  local src = source
  for token, run in pairs(Runner.runs) do
    if run.src == src then Runner.runs[token] = nil end
  end
end)

-- Periodic garbage collection for expired runs and cooldown timers.
CreateThread(function()
  while true do
    Wait(60000)
    local now = GetGameTimer()
    for token, run in pairs(Runner.runs) do
      if now - run.started > 600000 then Runner.runs[token] = nil end
    end
    local t = os.time()
    for k, v in pairs(Runner.cooldowns) do if v < t then Runner.cooldowns[k] = nil end end
  end
end)
