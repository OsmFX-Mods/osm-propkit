-- Central in-memory store synchronizing database records, runtime modifications, and networked entities.
Store = { models = {}, placements = {}, scenes = {}, packs = {}, runtime = {} }

local EVENT = Util.EVENT

-- Computes a content-only fingerprint hash ignoring identifier and metadata fields.
function Store.fingerprint(item)
  local c = Util.copy(item)
  c.id, c.key, c.pack, c.modified, c.thumb = nil, nil, nil, nil, nil
  for k in pairs(c) do if type(k) == 'string' and k:sub(1, 1) == '_' then c[k] = nil end end
  return Util.hash(c)
end

-- Helper resolving property precedence and clearing values when false.
local function pick(opt, prev)
  if opt == false then return nil end
  if opt ~= nil then return opt end
  return prev
end

-- Computes hash of model profile settings excluding interaction definitions.
function Store.modelHash(m)
  local c = Util.copy(m)
  c.interactions = nil
  return Store.fingerprint(c)
end

-- Computes interaction definition hash excluding origin and ordering fields.
function Store.interactionHash(i)
  local c = Util.copy(i)
  c.origin, c.order = nil, nil
  return Util.hash(c)
end

-- Formats record for client broadcast, omitting internal metadata.
local function view(rec)
  local v = {}
  for k, val in pairs(rec) do
    if type(k) ~= 'string' or k:sub(1, 1) ~= '_' then v[k] = val end
  end
  v.pack, v.modified = rec._pack, rec._modified or nil
  return v
end
Store.view = view

local function placementView(rec)
  local v = view(rec)
  v.key = rec._key
  local rt = Store.runtime[rec.id]
  if rt then v.state, v.hidden, v.swap, v.netId = rt.state, rt.hidden, rt.swap, rt.netId end
  return v
end
Store.placementView = placementView

-- Loads database records into memory during server startup.

function Store.load()
  for _, row in ipairs(Db.models()) do
    local m = Schema.model(Util.decode(row.data, {}))
    if m then
      m._pack, m._hash, m._modified = row.pack_id, row.origin_hash, Util.truthy(row.modified)
      Store.models[m.model] = m
    end
  end
  for _, row in ipairs(Db.placements()) do
    local d = Util.decode(row.data, {})
    d.id, d.model = row.id, row.model
    d.pos = { x = row.x, y = row.y, z = row.z }
    d.rot = { x = row.rx, y = row.ry, z = row.rz }
    d.enabled = Util.truthy(row.enabled)
    local saved = d.state
    local p = Schema.placement(d)
    if p then
      p._pack, p._key, p._hash, p._modified = row.pack_id, row.pack_key, row.origin_hash, Util.truthy(row.modified)
      p._state = type(saved) == 'table' and saved or nil
      Store.placements[p.id] = p
      if p._state then Store.runtime[p.id] = { state = p._state.state, swap = p._state.swap } end
    end
  end
  for _, row in ipairs(Db.scenes()) do
    Store.scenes[row.id] = {
      id = row.id, name = row.name, model = row.model, data = Util.decode(row.data, {}),
      _pack = row.pack_id, _key = row.pack_key, _hash = row.origin_hash, _modified = Util.truthy(row.modified),
    }
  end
  for _, row in ipairs(Db.packs()) do
    local meta = Util.decode(row.meta, {})
    Store.packs[row.id] = { id = row.id, name = row.name, version = row.version, author = row.author, source = row.source, installed = row.installed, description = meta.description, url = meta.url }
  end
  print(('^2[propkit]^7 loaded %d models, %d placements, %d scenes, %d packs'):format(
    Util.count(Store.models), Util.count(Store.placements), Util.count(Store.scenes), Util.count(Store.packs)))
end

-- Generates full dataset snapshot for connecting clients.
function Store.snapshot(admin)
  local models, placements = {}, {}
  for _, m in pairs(Store.models) do models[#models + 1] = view(m) end
  for _, p in pairs(Store.placements) do
    if p.enabled ~= false or admin then placements[#placements + 1] = placementView(p) end
  end
  return { models = models, placements = placements }
end

-- Client state broadcast and debounced delta flush routines.

local pendingP, pendingRemove, flushQueued = {}, {}, false

local function flush()
  flushQueued = false
  local up, rm = {}, {}
  for id in pairs(pendingP) do
    local p = Store.placements[id]
    if p then up[#up + 1] = placementView(p) end
  end
  for id in pairs(pendingRemove) do rm[#rm + 1] = id end
  pendingP, pendingRemove = {}, {}
  if #up > 0 or #rm > 0 then TriggerClientEvent(EVENT .. 'placements', -1, up, rm) end
end

-- Debounces placement updates to broadcast batched deltas.
function Store.touch(id, removed)
  if removed then pendingRemove[id], pendingP[id] = true, nil else pendingP[id] = true end
  if not flushQueued then
    flushQueued = true
    SetTimeout(50, flush)
  end
end

function Store.broadcastModels(up, rm)
  local list = {}
  for _, m in ipairs(up or {}) do list[#list + 1] = view(m) end
  TriggerClientEvent(EVENT .. 'models', -1, list, rm or {})
end

-- Model profile storage routines.

-- Inserts or updates a model profile and updates pack modification status.
function Store.putModel(m, opts)
  opts = opts or {}
  local prev = Store.models[m.model]
  m._pack = pick(opts.pack, prev and prev._pack)
  m._hash = pick(opts.hash, prev and prev._hash)
  if opts.modified ~= nil then m._modified = opts.modified
  else m._modified = m._hash ~= nil and Store.modelHash(m) ~= m._hash or false end
  m.thumb = m.thumb or (prev and prev.thumb) or nil
  Store.models[m.model] = m
  Db.saveModel(m, { pack = m._pack, hash = m._hash, modified = m._modified })
  if not opts.quiet then Store.broadcastModels({ m }) end
  Network.modelChanged(m.model)
  return m
end

function Store.removeModel(model, quiet)
  if not Store.models[model] then return false end
  Store.models[model] = nil
  Db.deleteModel(model)
  if not quiet then Store.broadcastModels({}, { model }) end
  return true
end

-- Resolves model profile from store or returns fallback schema.
function Store.profile(model)
  return Store.models[model] or Schema.model({ model = model })
end

-- Placement storage routines.

function Store.newId()
  local id
  repeat id = Util.id('pk') until not Store.placements[id]
  return id
end

function Store.putPlacement(p, opts)
  opts = opts or {}
  local prev = p.id and Store.placements[p.id]
  p.id = p.id or Store.newId()
  p._pack = pick(opts.pack, prev and prev._pack)
  p._key = pick(opts.key, prev and prev._key)
  p._hash = pick(opts.hash, prev and prev._hash)
  p._state = prev and prev._state or nil
  if opts.modified ~= nil then p._modified = opts.modified
  else p._modified = p._hash ~= nil and Store.fingerprint(p) ~= p._hash or false end
  Store.placements[p.id] = p
  if not opts.noDb then
    local d = Util.copy(p)
    d.state = p._state
    Db.savePlacement(d, { pack = p._pack, key = p._key, hash = p._hash, modified = p._modified, by = opts.by })
  end
  Network.sync(p.id)
  Store.touch(p.id)
  return p
end

function Store.removePlacement(id)
  local p = Store.placements[id]
  if not p then return false end
  Store.placements[id] = nil
  Store.runtime[id] = nil
  Db.deletePlacement(id)
  Network.despawn(id)
  Store.touch(id, true)
  return true
end

-- Updates in-memory runtime flags with optional database persistence.
function Store.setRuntime(id, patch, persist)
  local p = Store.placements[id]
  if not p then return end
  local rt = Store.runtime[id] or {}
  for k, v in pairs(patch) do
    if v == false and k ~= 'state' then rt[k] = nil else rt[k] = v end
  end
  Store.runtime[id] = rt
  if persist then
    p._state = { state = rt.state, swap = rt.swap }
    local d = Util.copy(p)
    d.state = p._state
    Db.savePlacement(d, { pack = p._pack, key = p._key, hash = p._hash, modified = p._modified })
  end
  Network.sync(id)
  Store.touch(id)
end

-- Returns active placement model considering runtime swaps.
function Store.modelOf(p)
  local rt = Store.runtime[p.id]
  return rt and rt.swap or p.model
end

-- Studio scene storage routines.

function Store.putScene(s, opts)
  opts = opts or {}
  local prev = s.id and Store.scenes[s.id]
  s.id = s.id or Util.id('sc')
  s._pack = pick(opts.pack, prev and prev._pack)
  s._key = pick(opts.key, prev and prev._key)
  s._hash = pick(opts.hash, prev and prev._hash)
  if opts.modified ~= nil then s._modified = opts.modified
  else s._modified = s._hash ~= nil and Store.fingerprint({ name = s.name, model = s.model, data = s.data }) ~= s._hash or false end
  Store.scenes[s.id] = s
  Db.saveScene(s, { pack = s._pack, key = s._key, hash = s._hash, modified = s._modified })
  return s
end

function Store.removeScene(id)
  if not Store.scenes[id] then return false end
  Store.scenes[id] = nil
  Db.deleteScene(id)
  return true
end

function Store.sceneList()
  local out = {}
  for _, s in pairs(Store.scenes) do
    out[#out + 1] = { id = s.id, name = s.name, model = s.model, pack = s._pack, modified = s._modified or nil }
  end
  table.sort(out, function(a, b) return a.name < b.name end)
  return out
end
