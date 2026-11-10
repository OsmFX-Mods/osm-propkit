-- Pack manager handling discovery, diff inspection, staging, selective import, and export.
Packs = { pending = {} }

local SELF = Util.RESOURCE
local fs = exports[SELF]

local SECTIONS = { 'models', 'interactions', 'placements', 'scenes' }
local PROFILE_KEYS = { 'label', 'category', 'description', 'tags', 'worldTargets', 'studio', 'variants' }

-- Pack parsing and source discovery.

local function parse(text, origin)
  if type(text) ~= 'string' or text == '' then return nil, 'empty file' end
  local ok, raw = pcall(json.decode, text)
  if not ok or type(raw) ~= 'table' then return nil, 'not valid json' end
  local pack, err = Schema.pack(raw)
  if not pack then return nil, err end
  return { pack = pack, raw = raw, source = origin }
end

-- Aggregates pack files from the local directory and started external resources.
local function sources()
  local out = {}
  for _, f in ipairs(fs:fsList('packs', '.json')) do
    if not f.dir then out[#out + 1] = { source = 'file:' .. f.name, label = 'packs/' .. f.name, text = fs:fsRead('packs/' .. f.name) } end
  end
  for i = 0, GetNumResources() - 1 do
    local res = GetResourceByFindIndex(i)
    if res and res ~= SELF then
      local n = GetNumResourceMetadata(res, 'osm_propkit_pack')
      for j = 0, n - 1 do
        local file = GetResourceMetadata(res, 'osm_propkit_pack', j)
        if file then
          out[#out + 1] = { source = ('res:%s:%s'):format(res, file), label = ('%s/%s'):format(res, file), text = LoadResourceFile(res, file), resource = res, state = GetResourceState(res) }
        end
      end
    end
  end
  return out
end

function Packs.readSource(source)
  for _, s in ipairs(sources()) do
    if s.source == source then return parse(s.text, s.source) end
  end
  return nil, 'source not found'
end

-- Compares semver version strings.
local function vcmp(a, b)
  local pa, pb = {}, {}
  for n in tostring(a):gmatch('%d+') do pa[#pa + 1] = tonumber(n) end
  for n in tostring(b):gmatch('%d+') do pb[#pb + 1] = tonumber(n) end
  for i = 1, math.max(#pa, #pb) do
    local x, y = pa[i] or 0, pb[i] or 0
    if x ~= y then return x < y and -1 or 1 end
  end
  return 0
end

-- Discovers installable packs and reports version status.
function Packs.discover()
  local list = {}
  for _, s in ipairs(sources()) do
    local entry = { source = s.source, label = s.label, resource = s.resource }
    local r, err = parse(s.text, s.source)
    if not r then
      entry.status, entry.error = 'invalid', err
    else
      local p = r.pack
      entry.id, entry.name, entry.version, entry.author, entry.description = p.id, p.name, p.version, p.author, p.description
      entry.counts = { models = #p.models, placements = #p.placements, scenes = #p.scenes, interactions = 0 }
      for _, m in ipairs(p.models) do entry.counts.interactions = entry.counts.interactions + #m.interactions end
      local inst = Store.packs[p.id]
      if not inst then entry.status = 'new'
      else
        entry.installed = inst.version
        local c = vcmp(inst.version, p.version)
        entry.status = c < 0 and 'update' or c == 0 and 'installed' or 'older'
      end
    end
    list[#list + 1] = entry
  end
  return list
end

-- Returns currently installed packs with entity and modification counts.
function Packs.installed()
  local out = {}
  for id, p in pairs(Store.packs) do
    local e = { id = id, name = p.name, version = p.version, author = p.author, source = p.source, installed = p.installed, description = p.description,
      counts = { models = 0, placements = 0, scenes = 0, modified = 0 } }
    for _, m in pairs(Store.models) do
      if m._pack == id then e.counts.models = e.counts.models + 1 if m._modified then e.counts.modified = e.counts.modified + 1 end end
    end
    for _, pl in pairs(Store.placements) do
      if pl._pack == id then e.counts.placements = e.counts.placements + 1 if pl._modified then e.counts.modified = e.counts.modified + 1 end end
    end
    for _, sc in pairs(Store.scenes) do
      if sc._pack == id then e.counts.scenes = e.counts.scenes + 1 end
    end
    out[#out + 1] = e
  end
  table.sort(out, function(a, b) return a.name < b.name end)
  return out
end

-- Pack diffing and conflict resolution engine.

-- Merges explicit profile keys from pack definitions without overwriting existing settings.
local function patchProfile(current, raw, norm)
  local out = Util.copy(current)
  for _, k in ipairs(PROFILE_KEYS) do
    if raw[k] ~= nil then out[k] = Util.copy(norm[k]) end
  end
  if type(raw.spawn) == 'table' then
    out.spawn = Util.copy(out.spawn or {})
    for k in pairs(raw.spawn) do if norm.spawn[k] ~= nil then out.spawn[k] = norm.spawn[k] end end
  end
  return out
end

local function rawModel(r, name)
  for _, m in ipairs(r.raw.models or {}) do if m.model == name then return m end end
  return {}
end

local function findBy(list, id)
  for i, v in ipairs(list or {}) do if v.id == id then return v, i end end
end

local function bump(counts, status) counts[status] = (counts[status] or 0) + 1 end

function Packs.diff(r)
  local pack = r.pack
  local out = { pack = { id = pack.id, name = pack.name, version = pack.version, author = pack.author, description = pack.description, installed = Store.packs[pack.id] and Store.packs[pack.id].version or nil },
    sections = {} }
  for _, s in ipairs(SECTIONS) do out.sections[s] = { items = {}, counts = {} } end

  -- Models: profile settings
  local inPack = {}
  for _, m in ipairs(pack.models) do
    inPack[m.model] = true
    local cur = Store.models[m.model]
    local item = { key = m.model, label = m.label or m.model }
    if not cur then item.status = 'add'
    else
      local patched = patchProfile(cur, rawModel(r, m.model), m)
      if Store.modelHash(patched) == Store.modelHash(cur) then item.status = 'same'
      elseif cur._modified or cur._pack ~= pack.id then item.status = 'conflict' item.why = cur._pack ~= pack.id and (cur._pack and ('owned by ' .. cur._pack) or 'made on this server') or 'changed on this server'
      else item.status = 'update' end
    end
    local sec = out.sections.models
    sec.items[#sec.items + 1] = item
    bump(sec.counts, item.status)

    -- Interactions on that model, matched by id
    local isec = out.sections.interactions
    for _, it in ipairs(m.interactions) do
      local curList = cur and cur.interactions or {}
      local c = findBy(curList, it.id)
      local ii = { key = m.model .. '/' .. it.id, model = m.model, label = it.label }
      if not c then ii.status = 'add'
      elseif Store.interactionHash(c) == Store.interactionHash(it) then ii.status = 'same'
      elseif c.origin and c.origin ~= Store.interactionHash(c) then ii.status = 'conflict' ii.why = 'changed on this server'
      elseif not c.origin then ii.status = 'conflict' ii.why = 'made on this server'
      else ii.status = 'update' end
      isec.items[#isec.items + 1] = ii
      bump(isec.counts, ii.status)
    end
  end
  for name, m in pairs(Store.models) do
    if m._pack == pack.id and not inPack[name] then
      local sec = out.sections.models
      sec.items[#sec.items + 1] = { key = name, label = m.label, status = 'removed' }
      bump(sec.counts, 'removed')
    end
  end

  -- Placements, matched by pack key
  local byKey = {}
  for _, p in pairs(Store.placements) do if p._pack == pack.id and p._key then byKey[p._key] = p end end
  local seen = {}
  for _, p in ipairs(pack.placements) do
    seen[p.key] = true
    local cur = byKey[p.key]
    local item = { key = p.key, label = p.label or p.model, model = p.model, pos = p.pos }
    if not cur then item.status = 'add'
    elseif Store.fingerprint(cur) == Store.fingerprint(p) then item.status = 'same'
    elseif cur._modified then item.status = 'conflict' item.why = 'moved or edited on this server'
    else item.status = 'update' end
    local sec = out.sections.placements
    sec.items[#sec.items + 1] = item
    bump(sec.counts, item.status)
  end
  for key, cur in pairs(byKey) do
    if not seen[key] then
      local sec = out.sections.placements
      sec.items[#sec.items + 1] = { key = key, label = cur.label or cur.model, model = cur.model, status = 'removed' }
      bump(sec.counts, 'removed')
    end
  end

  -- Scenes, matched by pack key
  local sByKey = {}
  for _, s in pairs(Store.scenes) do if s._pack == pack.id and s._key then sByKey[s._key] = s end end
  seen = {}
  for _, s in ipairs(pack.scenes) do
    seen[s.key] = true
    local cur = sByKey[s.key]
    local item = { key = s.key, label = s.name }
    local fp = Store.fingerprint({ name = s.name, model = s.model, data = s.data })
    if not cur then item.status = 'add'
    elseif Store.fingerprint({ name = cur.name, model = cur.model, data = cur.data }) == fp then item.status = 'same'
    elseif cur._modified then item.status = 'conflict' item.why = 'changed on this server'
    else item.status = 'update' end
    local sec = out.sections.scenes
    sec.items[#sec.items + 1] = item
    bump(sec.counts, item.status)
  end
  for key, cur in pairs(sByKey) do
    if not seen[key] then
      local sec = out.sections.scenes
      sec.items[#sec.items + 1] = { key = key, label = cur.name, status = 'removed' }
      bump(sec.counts, 'removed')
    end
  end
  return out
end

-- Stages a pack import and generates a structural diff for review.
function Packs.stage(src, text, source)
  local r, err
  if source then r, err = Packs.readSource(source) else r, err = parse(text, 'paste') end
  if not r then return { ok = false, msg = err } end
  local token = Util.id('imp')
  Packs.pending[token] = { r = r, src = src, at = os.time() }
  local d = Packs.diff(r)
  d.ok, d.token = true, token
  return d
end

-- Strategy-based pack import applicator.

-- Evaluates item inclusion based on section strategy: merge, overwrite, add, replace, or skip.
local function wants(strategy, status)
  if strategy == 'skip' then return false end
  if status == 'add' then return true end
  if status == 'update' then return strategy ~= 'add' end
  if status == 'conflict' then return strategy == 'overwrite' or strategy == 'replace' end
  if status == 'removed' then return strategy == 'replace' end
  return false
end

function Packs.apply(token, strategies, by)
  local pend = Packs.pending[token]
  if not pend then return { ok = false, msg = 'This import expired, load it again.' } end
  Packs.pending[token] = nil
  local r = pend.r
  local pack = r.pack
  strategies = type(strategies) == 'table' and strategies or {}
  local st = function(s) return strategies[s] or 'merge' end
  local d = Packs.diff(r)
  local status = {}
  for _, s in ipairs(SECTIONS) do
    status[s] = {}
    for _, it in ipairs(d.sections[s].items) do status[s][it.key] = it.status end
  end
  local done = { models = 0, interactions = 0, placements = 0, scenes = 0, removed = 0 }
  local touchedModels = {}

  -- Models and their interactions
  for _, m in ipairs(pack.models) do
    local cur = Store.models[m.model]
    local profile = cur and Util.copy(cur) or Schema.model({ model = m.model })
    local changed = false
    if wants(st('models'), status.models[m.model]) then
      profile = patchProfile(profile, rawModel(r, m.model), m)
      if not cur then profile.interactions = {} end
      changed = true
      done.models = done.models + 1
    end
    for _, it in ipairs(m.interactions) do
      local s = status.interactions[m.model .. '/' .. it.id]
      if wants(st('interactions'), s) then
        local copy = Util.copy(it)
        copy.origin = Store.interactionHash(it)
        local _, idx = findBy(profile.interactions, it.id)
        if idx then profile.interactions[idx] = copy else profile.interactions[#profile.interactions + 1] = copy end
        changed = true
        done.interactions = done.interactions + 1
      end
    end
    if changed then
      local own = (not cur) or cur._pack == pack.id or wants(st('models'), status.models[m.model])
      Store.putModel(profile, {
        pack = own and pack.id or nil,
        hash = own and Store.modelHash(patchProfile(profile, rawModel(r, m.model), m)) or nil,
        modified = own and false or nil, quiet = true,
      })
      touchedModels[#touchedModels + 1] = profile
    end
  end
  local removedModels = {}
  if st('models') == 'replace' then
    for name, s in pairs(status.models) do
      if s == 'removed' then Store.removeModel(name, true) removedModels[#removedModels + 1] = name done.removed = done.removed + 1 end
    end
  end
  if #touchedModels > 0 or #removedModels > 0 then Store.broadcastModels(touchedModels, removedModels) end

  -- Placements
  local byKey = {}
  for _, p in pairs(Store.placements) do if p._pack == pack.id and p._key then byKey[p._key] = p end end
  local batch = {}
  for _, p in ipairs(pack.placements) do
    if wants(st('placements'), status.placements[p.key]) then
      local copy = Util.copy(p)
      local key = copy.key
      copy.key = nil
      copy.id = byKey[key] and byKey[key].id or nil
      local saved = Store.putPlacement(copy, { pack = pack.id, key = key, hash = Store.fingerprint(p), modified = false, noDb = true, by = by })
      batch[#batch + 1] = { saved, { pack = pack.id, key = key, hash = saved._hash, modified = false, by = by } }
      done.placements = done.placements + 1
    end
  end
  Db.savePlacements(batch)
  if st('placements') == 'replace' then
    for key, s in pairs(status.placements) do
      if s == 'removed' and byKey[key] then Store.removePlacement(byKey[key].id) done.removed = done.removed + 1 end
    end
  end

  -- Scenes
  local sByKey = {}
  for _, s in pairs(Store.scenes) do if s._pack == pack.id and s._key then sByKey[s._key] = s end end
  for _, s in ipairs(pack.scenes) do
    if wants(st('scenes'), status.scenes[s.key]) then
      local cur = sByKey[s.key]
      Store.putScene({ id = cur and cur.id or nil, name = s.name, model = s.model, data = s.data },
        { pack = pack.id, key = s.key, hash = Store.fingerprint({ name = s.name, model = s.model, data = s.data }), modified = false })
      done.scenes = done.scenes + 1
    end
  end
  if st('scenes') == 'replace' then
    for key, s in pairs(status.scenes) do
      if s == 'removed' and sByKey[key] then Store.removeScene(sByKey[key].id) done.removed = done.removed + 1 end
    end
  end

  Store.packs[pack.id] = { id = pack.id, name = pack.name, version = pack.version, author = pack.author, source = r.source, installed = os.time(), description = pack.description, url = pack.url }
  Db.savePack(pack, r.source)
  print(('^2[propkit]^7 pack %s %s applied: %d models, %d interactions, %d placements, %d scenes, %d removed'):format(
    pack.id, pack.version, done.models, done.interactions, done.placements, done.scenes, done.removed))
  return { ok = true, done = done, pack = { id = pack.id, name = pack.name, version = pack.version } }
end

-- Uninstalls a pack while optionally preserving locally modified items.
function Packs.uninstall(id, keepEdited)
  if not Store.packs[id] then return { ok = false, msg = 'Pack not installed.' } end
  local n = 0
  for pid, p in pairs(Store.placements) do
    if p._pack == id then
      if keepEdited and p._modified then Store.putPlacement(p, { pack = false, key = false, hash = false, modified = false })
      else Store.removePlacement(pid) n = n + 1 end
    end
  end
  for sid, s in pairs(Store.scenes) do
    if s._pack == id then Store.removeScene(sid) n = n + 1 end
  end
  local rm = {}
  for name, m in pairs(Store.models) do
    if m._pack == id then
      if keepEdited and m._modified then Store.putModel(m, { pack = false, hash = false, modified = false })
      else Store.removeModel(name, true) rm[#rm + 1] = name n = n + 1 end
    end
  end
  if #rm > 0 then Store.broadcastModels({}, rm) end
  Store.packs[id] = nil
  Db.deletePack(id)
  return { ok = true, removed = n }
end

-- Pack builder and export serialization.

-- Strips internal runtime state and metadata prior to export.
local function clean(v)
  if type(v) ~= 'table' then return v end
  local out = {}
  local isArr = #v > 0
  for k, val in pairs(v) do
    if not (type(k) == 'string' and (k:sub(1, 1) == '_' or k == 'origin' or k == 'modified' or k == 'pack' or k == 'thumb' or k == 'netId' or k == 'hidden' or k == 'swap' or k == 'state')) then
      local c = clean(val)
      if not (type(c) == 'table' and next(c) == nil and not isArr) then out[k] = c end
    end
  end
  return out
end

-- Assembles pack data structure from selected models, placements, and scenes.
function Packs.build(o)
  local pack = {
    format = Schema.FORMAT, id = Util.slug(o.id or o.name or 'my_pack'), name = o.name or o.id or 'My pack',
    version = o.version or '1.0.0', author = o.author, description = o.description,
    models = {}, placements = {}, scenes = {},
  }
  local wantModel = {}
  if o.models == 'all' then for name in pairs(Store.models) do wantModel[name] = true end
  else for _, name in ipairs(o.models or {}) do wantModel[name] = true end end

  local names = {}
  for name in pairs(wantModel) do names[#names + 1] = name end
  table.sort(names)
  for _, name in ipairs(names) do
    local m = Store.models[name]
    if m then
      local e = { model = name }
      if o.profiles ~= false then
        local c = clean(m)
        c.interactions = nil
        for k, v in pairs(c) do e[k] = v end
      end
      if o.interactions ~= false and #(m.interactions or {}) > 0 then e.interactions = clean(m.interactions) end
      pack.models[#pack.models + 1] = e
    end
  end

  local pick = {}
  if type(o.placements) == 'table' then for _, id in ipairs(o.placements) do pick[id] = true end end
  local list = {}
  for id, p in pairs(Store.placements) do
    local take = false
    if o.placements == 'all' then take = true
    elseif o.placements == 'models' then take = wantModel[p.model] == true
    elseif pick[id] then take = true end
    if take and o.group and o.group ~= '' and p.group ~= o.group then take = false end
    if take and o.near and o.near.pos then
      take = Util.dist(p.pos, o.near.pos) <= (o.near.radius or 50.0)
    end
    if take then list[#list + 1] = p end
  end
  table.sort(list, function(a, b) return (a._key or a.id) < (b._key or b.id) end)
  local used = {}
  for _, p in ipairs(list) do
    local c = clean(p)
    local key = p._key or Util.slug((p.label or p.model))
    local base, k = key, 2
    while used[key] do key = base .. '_' .. k k = k + 1 end
    used[key] = true
    c.id, c.key = nil, key
    if c.enabled == true then c.enabled = nil end
    if c.inherit == true then c.inherit = nil end
    pack.placements[#pack.placements + 1] = c
  end

  local sp = {}
  if type(o.scenes) == 'table' then for _, id in ipairs(o.scenes) do sp[id] = true end end
  for id, s in pairs(Store.scenes) do
    if sp[id] or (o.scenes == 'models' and s.model and wantModel[s.model]) then
      pack.scenes[#pack.scenes + 1] = { key = s._key or Util.slug(s.name), name = s.name, model = s.model, data = s.data }
    end
  end
  return pack
end

-- Serializes table to formatted, deterministic JSON.
local ORDER = { 'format', 'id', 'name', 'version', 'author', 'description', 'url', 'key', 'model', 'label', 'category', 'group',
  'pos', 'rot', 'x', 'y', 'z', 'mode', 'spawn', 'interactions', 'type', 'icon' }
local RANK = {}
for i, k in ipairs(ORDER) do RANK[k] = i end

local function pretty(v, ind)
  ind = ind or ''
  local t = type(v)
  if t ~= 'table' then
    if t == 'number' and v % 1 ~= 0 then return (string.format('%.4f', v):gsub('0+$', ''):gsub('%.$', '.0')) end
    return json.encode(v)
  end
  local n = #v
  local nxt = ind .. '  '
  if n > 0 then
    local simple = true
    for i = 1, n do if type(v[i]) == 'table' then simple = false break end end
    local parts = {}
    for i = 1, n do parts[i] = pretty(v[i], nxt) end
    if simple then return '[' .. table.concat(parts, ', ') .. ']' end
    return '[\n' .. nxt .. table.concat(parts, ',\n' .. nxt) .. '\n' .. ind .. ']'
  end
  local keys = {}
  for k in pairs(v) do keys[#keys + 1] = tostring(k) end
  if #keys == 0 then return '{}' end
  table.sort(keys, function(a, b)
    local ra, rb = RANK[a] or 999, RANK[b] or 999
    if ra ~= rb then return ra < rb end
    return a < b
  end)
  local isVec = #keys == 3 and v.x and v.y and v.z
  local parts = {}
  for i, k in ipairs(keys) do parts[i] = json.encode(k) .. ': ' .. pretty(v[k], nxt) end
  if isVec then return '{ ' .. table.concat(parts, ', ') .. ' }' end
  return '{\n' .. nxt .. table.concat(parts, ',\n' .. nxt) .. '\n' .. ind .. '}'
end
Packs.pretty = pretty

function Packs.export(o)
  local pack = Packs.build(o)
  local text = pretty(pack)
  local file = ('%s/%s-%s.json'):format(Config.Studio.exportsFolder, pack.id, Util.slug(pack.version))
  local abs = fs:fsWrite(file, text)
  return { ok = true, text = text, file = file, path = abs, counts = { models = #pack.models, placements = #pack.placements, scenes = #pack.scenes } }
end

-- Periodic cleanup thread for expired staged imports.
CreateThread(function()
  while true do
    Wait(60000)
    local now = os.time()
    for k, v in pairs(Packs.pending) do if now - v.at > 600 then Packs.pending[k] = nil end end
  end
end)
