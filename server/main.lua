-- Server initialization, administrative RPC dispatch, commands, and exports.
local EVENT = Util.EVENT

-- Internal RPC registry mapping handlers to permission gates.
local Rpc = {}

local function reg(name, perm, fn) Rpc[name] = { perm = perm, fn = fn } end

lib.callback.register(EVENT .. 'rpc', function(src, name, args)
  local r = Rpc[name]
  if not r then return { ok = false, msg = 'unknown call' } end
  if r.perm and not Bridge.allowed(src, r.perm) then return { ok = false, msg = Locale.notAdmin } end
  local ok, res = pcall(r.fn, src, type(args) == 'table' and args or {})
  if not ok then
    print(('^1[propkit] rpc %s failed: %s^7'):format(name, res))
    return { ok = false, msg = 'Server error, see console.' }
  end
  return res
end)

local function perms(src)
  return { edit = Bridge.allowed(src, 'edit'), studio = Bridge.allowed(src, 'studio'), packs = Bridge.allowed(src, 'packs') }
end

lib.callback.register(EVENT .. 'bootstrap', function(src)
  while not Store.ready do Wait(100) end
  local p = perms(src)
  local snap = Store.snapshot(p.edit)
  snap.perms = p
  return snap
end)

-- Model profile RPC endpoints.

reg('model:save', 'edit', function(_, a)
  local m = Schema.model(a.model)
  if not m then return { ok = false, msg = 'Invalid model profile.' } end
  local prev = Store.models[m.model]
  if prev then
    -- Preserves pack origin metadata when saving profile edits.
    local origins = {}
    for _, i in ipairs(prev.interactions or {}) do origins[i.id] = i.origin end
    for _, i in ipairs(m.interactions) do if i.origin == nil then i.origin = origins[i.id] end end
    m.thumb = prev.thumb
  end
  Store.putModel(m)
  return { ok = true, model = Store.view(Store.models[m.model]) }
end)

reg('model:delete', 'edit', function(_, a)
  local model = tostring(a.model or '')
  for _, p in pairs(Store.placements) do
    if p.model == model and not a.force then return { ok = false, msg = 'Placements still use this model.' } end
  end
  return { ok = Store.removeModel(model) }
end)

reg('model:thumb', 'edit', function(_, a)
  local m = Store.models[a.model]
  if not m then
    m = Schema.model({ model = a.model })
    if not m then return { ok = false } end
  end
  m.thumb = a.shot
  Store.putModel(m)
  return { ok = true }
end)

-- Returns thumbnail data URIs for specified shot IDs.
reg('thumbs', 'edit', function(_, a)
  local out = {}
  for _, id in ipairs(a.ids or {}) do
    if type(id) == 'string' then out[id] = Shots.thumbFor(id) end
  end
  return { ok = true, thumbs = out }
end)

-- Placement management RPC endpoints.

reg('placement:save', 'edit', function(src, a)
  local p = Schema.placement(a.placement)
  if not p then return { ok = false, msg = 'Invalid placement.' } end
  if p.id and not Store.placements[p.id] then p.id = nil end
  if not Store.models[p.model] then Store.putModel(Schema.model({ model = p.model })) end
  local saved = Store.putPlacement(p, { by = Bridge.identifier(src) })
  return { ok = true, placement = Store.placementView(saved) }
end)

reg('placement:delete', 'edit', function(_, a)
  local ids = type(a.ids) == 'table' and a.ids or { a.id }
  local n = 0
  for _, id in ipairs(ids) do if Store.removePlacement(id) then n = n + 1 end end
  return { ok = n > 0, removed = n }
end)

reg('placement:toggle', 'edit', function(_, a)
  local ids = type(a.ids) == 'table' and a.ids or { a.id }
  for _, id in ipairs(ids) do
    local p = Store.placements[id]
    if p then
      p.enabled = a.enabled and true or false
      Store.putPlacement(p)
    end
  end
  return { ok = true }
end)

-- Clears placement runtime state and reapplies base configuration.
reg('placement:reset', 'edit', function(_, a)
  local p = Store.placements[a.id]
  if not p then return { ok = false } end
  Store.runtime[a.id] = nil
  p._state = nil
  Store.putPlacement(p)
  return { ok = true }
end)

-- Pack import, export, and staging RPC endpoints.

reg('packs:list', 'packs', function()
  return { ok = true, installed = Packs.installed(), available = Packs.discover() }
end)

reg('packs:stage', 'packs', function(src, a)
  return Packs.stage(src, a.text, a.source)
end)

reg('packs:apply', 'packs', function(src, a)
  return Packs.apply(a.token, a.strategies, Bridge.identifier(src))
end)

reg('packs:uninstall', 'packs', function(_, a)
  return Packs.uninstall(a.id, a.keepEdited ~= false)
end)

reg('packs:export', 'packs', function(_, a)
  return Packs.export(a)
end)

-- Studio scene and shot management RPC endpoints.

reg('scenes:list', 'studio', function() return { ok = true, scenes = Store.sceneList() } end)

reg('scene:get', 'studio', function(_, a)
  local s = Store.scenes[a.id]
  if not s then return { ok = false } end
  return { ok = true, scene = { id = s.id, name = s.name, model = s.model, data = s.data } }
end)

reg('scene:save', 'studio', function(_, a)
  local s = Schema.scene(a.scene)
  if not s then return { ok = false, msg = 'Scene too large.' } end
  if s.id and not Store.scenes[s.id] then s.id = nil end
  local saved = Store.putScene(s)
  return { ok = true, id = saved.id }
end)

reg('scene:delete', 'studio', function(_, a) return { ok = Store.removeScene(a.id) } end)

reg('shots:list', 'studio', function() return { ok = true, shots = Shots.list() } end)

reg('shot:delete', 'studio', function(_, a) return { ok = Shots.delete(a.id) } end)

-- Administrative chat and console commands.

RegisterCommand(Config.Command, function(src)
  if src == 0 then return end
  if not Bridge.allowed(src, 'edit') then return Bridge.notify(src, Locale.noAccess, 'error') end
  TriggerClientEvent(EVENT .. 'open', src, 'hub', perms(src))
end, false)

RegisterCommand(Config.StudioCommand, function(src, args)
  if src == 0 then return end
  if not Bridge.allowed(src, 'studio') then return Bridge.notify(src, Locale.noAccess, 'error') end
  TriggerClientEvent(EVENT .. 'open', src, 'studio', perms(src), args[1])
end, false)

-- Headless server console command handlers.
RegisterCommand('propkit_install', function(src, args)
  if src ~= 0 then return end
  local target, strategy = args[1], args[2] or 'merge'
  if not target then return print('usage: propkit_install <packs/file.json | resource name> [merge|overwrite|add|replace]') end
  local source
  for _, e in ipairs(Packs.discover()) do
    if e.source == 'file:' .. target or e.label == 'packs/' .. target or e.resource == target or e.id == target then source = e.source break end
  end
  if not source then return print('^3[propkit]^7 no pack source matches ' .. target) end
  local d = Packs.stage(0, nil, source)
  if not d.ok then return print('^1[propkit]^7 ' .. tostring(d.msg)) end
  local res = Packs.apply(d.token, { models = strategy, interactions = strategy, placements = strategy, scenes = strategy }, 'console')
  if not res.ok then print('^1[propkit]^7 ' .. tostring(res.msg)) end
end, true)

RegisterCommand('propkit_export', function(src, args)
  if src ~= 0 then return end
  local id = args[1]
  if not id then return print('usage: propkit_export <packId> [all]') end
  local models = {}
  if args[2] == 'all' then models = 'all'
  else for name, m in pairs(Store.models) do if m._pack == id then models[#models + 1] = name end end end
  local inst = Store.packs[id] or {}
  local res = Packs.export({ id = id, name = inst.name or id, version = inst.version or '1.0.0', author = inst.author, models = models, placements = 'models', scenes = 'models' })
  print(('^2[propkit]^7 wrote %s'):format(res.path or res.file))
end, true)

-- Resource public exports API.

-- Installs a pack definition file from another resource with a merge strategy.
exports('InstallPack', function(resource, file, strategy)
  local source = ('res:%s:%s'):format(resource, file)
  local d = Packs.stage(0, nil, source)
  if not d.ok then return false, d.msg end
  strategy = strategy or 'merge'
  local res = Packs.apply(d.token, { models = strategy, interactions = strategy, placements = strategy, scenes = strategy }, resource)
  return res.ok, res.done
end)

exports('GetPlacement', function(id) local p = Store.placements[id] return p and Store.placementView(p) or nil end)
exports('GetPlacements', function(model)
  local out = {}
  for _, p in pairs(Store.placements) do if not model or p.model == model then out[#out + 1] = Store.placementView(p) end end
  return out
end)
exports('SetPlacementState', function(id, key, value, persist)
  local rt = Store.runtime[id] or {}
  local state = Util.copy(rt.state or {})
  state[key] = value
  Store.setRuntime(id, { state = state }, persist)
end)
exports('SetPlacementHidden', function(id, hidden) Store.setRuntime(id, { hidden = hidden and true or false }) end)
exports('SavePlacement', function(data)
  local p = Schema.placement(data)
  if not p then return nil end
  return Store.putPlacement(p).id
end)
exports('RemovePlacement', function(id) return Store.removePlacement(id) end)

-- Server bootstrap and startup tasks.

CreateThread(function()
  Db.init()
  Store.load()
  Store.ready = true
  Network.start()
  -- Automatically discovers and installs packs bundled within started resources.
  if Config.AutoInstall ~= false then
    Wait(1500)
    for _, e in ipairs(Packs.discover()) do
      if e.status == 'new' and e.resource and e.source then
        local d = Packs.stage(0, nil, e.source)
        if d.ok then Packs.apply(d.token, {}, 'auto:' .. e.resource) end
      end
    end
  end
end)
