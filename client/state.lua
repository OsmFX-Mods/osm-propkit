-- Client state store tracking cached models, placements, and permissions.
State = { models = {}, placements = {}, ready = false, listeners = {} }

local EVENT = Util.EVENT

function State.on(fn) State.listeners[#State.listeners + 1] = fn end

local function emit(kind, up, rm)
  for _, fn in ipairs(State.listeners) do fn(kind, up, rm) end
end

-- Retrieves a model definition profile with schema defaults.
function State.profile(model)
  return State.models[model] or State.fallback(model)
end

local fallbackCache = {}
function State.fallback(model)
  if not fallbackCache[model] then fallbackCache[model] = Schema.model({ model = model }) end
  return fallbackCache[model]
end

-- Resolves effective spawn settings between placement overrides and model profiles.
function State.settings(p)
  local prof = State.profile(p.model).spawn
  local function pick(v, d) if v == nil then return d end return v end
  return {
    model = p.swap or p.model,
    mode = p.mode or prof.mode,
    distance = p.distance or prof.distance,
    lod = p.lod or prof.lod,
    collision = pick(p.collision, prof.collision),
    freeze = pick(p.freeze, prof.freeze),
    invincible = prof.invincible,
    alpha = p.alpha,
  }
end

-- Merges placement-specific interactions with inherited model interactions.
function State.interactionsOf(p)
  local out = {}
  for _, i in ipairs(p.interactions or {}) do out[#out + 1] = { i = i, own = true } end
  if p.inherit ~= false then
    local prof = State.models[p.swap or p.model] or State.models[p.model]
    local mine = {}
    for _, i in ipairs(p.interactions or {}) do mine[i.id] = true end
    for _, i in ipairs(prof and prof.interactions or {}) do
      if not mine[i.id] then out[#out + 1] = { i = i, own = false } end
    end
  end
  table.sort(out, function(a, b) return (a.i.order or 0) < (b.i.order or 0) end)
  return out
end

function State.bootstrap()
  local snap = lib.callback.await(EVENT .. 'bootstrap', false)
  if not snap then return end
  State.models, State.placements = {}, {}
  for _, m in ipairs(snap.models or {}) do State.models[m.model] = m end
  for _, p in ipairs(snap.placements or {}) do State.placements[p.id] = p end
  UI.perms = snap.perms or {}
  State.ready = true
  emit('reset')
end

RegisterNetEvent(EVENT .. 'models', function(up, rm)
  for _, m in ipairs(up or {}) do State.models[m.model] = m fallbackCache[m.model] = nil end
  for _, name in ipairs(rm or {}) do State.models[name] = nil end
  emit('models', up, rm)
end)

RegisterNetEvent(EVENT .. 'placements', function(up, rm)
  for _, p in ipairs(up or {}) do
    if p.enabled == false and not UI.perms.edit then State.placements[p.id] = nil
    else State.placements[p.id] = p end
  end
  for _, id in ipairs(rm or {}) do State.placements[id] = nil end
  emit('placements', up, rm)
end)
