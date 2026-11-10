-- Schema normalization and input sanitization layer for models, placements, interactions, and packs.
Schema = {}

Schema.FORMAT = 'osm-propkit/pack@1'

Schema.STEP_SIDE = {
  progress = 'client', anim = 'client', wait = 'client', notify = 'client', sound = 'client', ptfx = 'client',
  clientEvent = 'client', command = 'client',
  serverEvent = 'mixed', export = 'mixed',
  giveItem = 'server', removeItem = 'server', giveMoney = 'server', removeMoney = 'server',
  setState = 'server', swapModel = 'server', pickup = 'server',
}

local function str(v, max, fallback)
  if v == nil then return fallback end
  v = tostring(v)
  if max and #v > max then v = v:sub(1, max) end
  return v
end

local function num(v, lo, hi, fallback)
  v = tonumber(v)
  if not v or v ~= v then return fallback end
  if lo and v < lo then v = lo end
  if hi and v > hi then v = hi end
  return v
end

local function bool(v, fallback)
  if v == nil then return fallback end
  return v == true or v == 1 or v == 'true'
end

local function hex(v)
  v = str(v, 16)
  if v and v:match('^#%x%x%x%x?%x?%x?%x?%x?$') then return v end
  return nil
end

-- Validates and bounds JSON argument structures.
local function args(v)
  if v == nil then return nil end
  if type(v) == 'string' then
    local d = Util.decode(v)
    if d ~= nil then v = d end
  end
  local ok, s = pcall(json.encode, v)
  if not ok or #s > 4000 then return nil end
  return v
end

-- Normalizes group permission mappings.
local function groupsOf(v)
  if type(v) == 'string' then return { [v] = 0 } end
  if type(v) ~= 'table' then return nil end
  local out, n = {}, 0
  for k, g in pairs(v) do
    if type(k) == 'number' and type(g) == 'string' then out[g] = 0 n = n + 1
    elseif type(k) == 'string' then out[k] = num(g, 0, 99, 0) n = n + 1 end
  end
  return n > 0 and out or nil
end

local function itemsOf(v)
  if type(v) == 'string' then return { [v] = 1 } end
  if type(v) ~= 'table' then return nil end
  local out, n = {}, 0
  for k, c in pairs(v) do
    if type(k) == 'number' and type(c) == 'string' then out[c] = 1 n = n + 1
    elseif type(k) == 'string' then out[k] = math.floor(num(c, 1, 1e6, 1)) n = n + 1 end
  end
  return n > 0 and out or nil
end

function Schema.gates(g)
  if type(g) ~= 'table' then return {} end
  local out = {
    groups = groupsOf(g.groups or g.jobs),
    items = itemsOf(g.items),
    anyItem = bool(g.anyItem, nil),
    cooldown = num(g.cooldown, 0, 86400 * 7, nil),
    cooldownScope = (g.cooldownScope == 'placement' or g.cooldownScope == 'global') and g.cooldownScope or (g.cooldown and 'player' or nil),
    hideIneligible = bool(g.hideIneligible, nil),
    state = type(g.state) == 'table' and next(g.state) and g.state or nil,
    onFoot = bool(g.onFoot, nil),
    hours = type(g.hours) == 'table' and { num(g.hours[1], 0, 23, 0), num(g.hours[2], 0, 24, 24) } or nil,
  }
  if out.cooldown == 0 then out.cooldown, out.cooldownScope = nil, nil end
  return out
end

local function animOf(a)
  if type(a) ~= 'table' then return nil end
  if a.scenario then return { scenario = str(a.scenario, 64) } end
  if not (a.dict and a.clip) then return nil end
  return { dict = str(a.dict, 96), clip = str(a.clip, 96), flag = math.floor(num(a.flag, 0, 1023, 1)) }
end

local function propOf(p)
  if type(p) ~= 'table' or not p.model then return nil end
  return {
    model = str(p.model, 64), bone = math.floor(num(p.bone, 0, 65535, 57005)),
    pos = Util.pos(p.pos) or { x = 0.0, y = 0.0, z = 0.0 }, rot = Util.rot(p.rot) or { x = 0.0, y = 0.0, z = 0.0 },
  }
end

-- Validates and sanitizes individual interaction pipeline step configurations.
function Schema.step(s)
  if type(s) ~= 'table' then return nil end
  local t = s.type
  if not Schema.STEP_SIDE[t] then return nil end
  local o = { type = t }
  if t == 'progress' then
    o.duration = math.floor(num(s.duration, 250, 600000, 3000))
    o.label = str(s.label, 80, 'Working')
    o.anim = animOf(s.anim)
    o.prop = propOf(s.prop)
    o.canCancel = bool(s.canCancel, true)
    o.freeze = bool(s.freeze, true)
  elseif t == 'anim' then
    o.anim = animOf(s.anim) or animOf(s)
    o.duration = math.floor(num(s.duration, 0, 600000, 2000))
    if not o.anim then return nil end
  elseif t == 'wait' then
    o.duration = math.floor(num(s.duration, 0, 600000, 1000))
  elseif t == 'notify' then
    o.text = str(s.text, 200, '')
    o.kind = ({ info = true, success = true, error = true, warning = true })[s.kind] and s.kind or 'info'
  elseif t == 'sound' then
    o.name, o.set = str(s.name, 64), str(s.set, 96)
    if not o.name then return nil end
  elseif t == 'ptfx' then
    o.asset, o.name = str(s.asset, 64, 'core'), str(s.name, 96)
    o.scale = num(s.scale, 0.05, 10, 1.0)
    o.duration = math.floor(num(s.duration, 100, 60000, 2000))
    if not o.name then return nil end
  elseif t == 'clientEvent' or t == 'serverEvent' then
    o.name = str(s.name, 128)
    if not o.name or o.name == '' then return nil end
    o.args = args(s.args)
    if t == 'serverEvent' then o.via = s.via == 'internal' and 'internal' or 'net' end
  elseif t == 'command' then
    o.command = str(s.command, 200)
    if not o.command then return nil end
  elseif t == 'export' then
    o.resource, o.fn = str(s.resource, 64), str(s.fn or s['function'], 64)
    if not (o.resource and o.fn) then return nil end
    o.side = s.side == 'server' and 'server' or 'client'
    o.args = args(s.args)
  elseif t == 'giveItem' or t == 'removeItem' then
    o.item = str(s.item, 64)
    if not o.item then return nil end
    o.count = math.floor(num(s.count, 1, 1e6, 1))
    if t == 'giveItem' then o.metadata = args(s.metadata) end
  elseif t == 'giveMoney' or t == 'removeMoney' then
    o.account = str(s.account, 32, 'cash')
    o.amount = math.floor(num(s.amount, 0, 1e9, 0))
  elseif t == 'setState' then
    o.key = str(s.key, 32)
    if not o.key then return nil end
    o.value = s.value
    o.toggle = bool(s.toggle, nil)
    o.persist = bool(s.persist, nil)
  elseif t == 'swapModel' then
    o.model = str(s.model, 64)
    if not o.model then return nil end
    o.persist = bool(s.persist, nil)
  elseif t == 'pickup' then
    o.respawn = math.floor(num(s.respawn, 0, 86400 * 7, 0))
    o.item = str(s.item, 64)
    o.count = math.floor(num(s.count, 1, 1e6, 1))
  end
  o.stopOnFail = bool(s.stopOnFail, nil)
  return o
end

-- Validates and formats interaction definition schemas.
function Schema.interaction(i, index)
  if type(i) ~= 'table' then return nil end
  local label = str(i.label, 80)
  if not label or label == '' then return nil end
  local o = {
    id = Util.slug(i.id or i.key or label),
    label = label,
    icon = str(i.icon, 64, 'fas fa-hand'),
    iconColor = hex(i.iconColor),
    description = str(i.description, 160),
    distance = num(i.distance, 0.5, 15.0, Config.Interact.defaultDistance),
    point = Util.pos(i.point),
    radius = num(i.radius, 0.05, 5.0, 0.35),
    bones = type(i.bones) == 'table' and i.bones or (type(i.bones) == 'string' and { i.bones } or nil),
    gates = Schema.gates(i.gates),
    steps = {},
    enabled = bool(i.enabled, true),
    order = math.floor(num(i.order, 0, 999, index or 0)),
    origin = str(i.origin, 16),
  }
  if type(i.steps) == 'table' then
    for n = 1, math.min(#i.steps, Config.Interact.maxSteps) do
      local s = Schema.step(i.steps[n])
      if s then o.steps[#o.steps + 1] = s end
    end
  end
  return o
end

function Schema.interactions(list)
  local out, seen = {}, {}
  if type(list) ~= 'table' then return out end
  for n = 1, #list do
    local i = Schema.interaction(list[n], n)
    if i then
      local base, k = i.id, 2
      while seen[i.id] do i.id = base .. '_' .. k k = k + 1 end
      seen[i.id] = true
      out[#out + 1] = i
    end
  end
  return out
end

-- Validates model profiles and default spawn parameters.
function Schema.model(m)
  if type(m) ~= 'table' then return nil end
  local model = str(m.model, 64)
  if not model or model == '' then return nil end
  local D = Config.ModelDefaults
  local spawn = type(m.spawn) == 'table' and m.spawn or {}
  return {
    model = model,
    label = str(m.label, 80, model),
    category = str(m.category, 40, D.category),
    description = str(m.description, 400),
    tags = type(m.tags) == 'table' and m.tags or nil,
    spawn = {
      mode = (spawn.mode == 'networked' or spawn.mode == 'local') and spawn.mode or D.mode,
      collision = bool(spawn.collision, D.collision),
      freeze = bool(spawn.freeze, D.freeze),
      distance = num(spawn.distance, 10.0, 1500.0, D.distance),
      lod = num(spawn.lod, 10.0, 3000.0, Config.Stream.defaultLod),
      invincible = bool(spawn.invincible, D.invincible),
    },
    interactions = Schema.interactions(m.interactions),
    worldTargets = bool(m.worldTargets, false),
    thumb = str(m.thumb, 64),
    studio = type(m.studio) == 'table' and m.studio or nil,
    variants = type(m.variants) == 'table' and m.variants or nil,
  }
end

-- Validates placement entities, world transforms, anchor offsets, and interior keys.
function Schema.placement(p)
  if type(p) ~= 'table' then return nil end
  local model = str(p.model, 64)
  local pos, rot = Util.pos(p.pos or p.coords), Util.rot(p.rot or p.rotation)
  if not (model and pos) then return nil end
  rot = rot or { x = 0.0, y = 0.0, z = num(p.heading, -360, 360, 0.0) }
  local o = {
    id = str(p.id, 32),
    model = model,
    label = str(p.label, 80),
    group = str(p.group, 48),
    pos = pos,
    rot = rot,
    mode = (p.mode == 'networked' or p.mode == 'local') and p.mode or nil,
    distance = num(p.distance, 10.0, 1500.0, nil),
    lod = num(p.lod, 10.0, 3000.0, nil),
    collision = bool(p.collision, nil),
    freeze = bool(p.freeze, nil),
    alpha = p.alpha and math.floor(num(p.alpha, 0, 255, 255)) or nil,
    bucket = p.bucket and math.floor(num(p.bucket, 0, 2 ^ 31, 0)) or nil,
    enabled = bool(p.enabled, true),
    inherit = bool(p.inherit, true),
    interactions = Schema.interactions(p.interactions),
    meta = type(p.meta) == 'table' and p.meta or nil,
  }
  if type(p.anchor) == 'table' and p.anchor.model and p.anchor.pos then
    o.anchor = {
      model = p.anchor.model,
      pos = Util.pos(p.anchor.pos), rot = Util.rot(p.anchor.rot) or { x = 0.0, y = 0.0, z = 0.0 },
      offset = Util.pos(p.anchor.offset) or { x = 0.0, y = 0.0, z = 0.0 },
      local_rot = Util.rot(p.anchor.local_rot) or { x = 0.0, y = 0.0, z = 0.0 },
      radius = num(p.anchor.radius, 0.1, 10.0, 1.5),
    }
  end
  if type(p.interior) == 'table' and p.interior.hash then
    o.interior = { hash = math.floor(num(p.interior.hash, -2 ^ 31, 2 ^ 32, 0)), room = math.floor(num(p.interior.room, -2 ^ 31, 2 ^ 32, 0)) }
  end
  return o
end

-- Validates studio scene records.
function Schema.scene(s)
  if type(s) ~= 'table' then return nil end
  local ok, enc = pcall(json.encode, s.data or s)
  if not ok or #enc > 200000 then return nil end
  return { id = str(s.id, 32), name = str(s.name, 80, 'Untitled scene'), model = str(s.model, 64), data = s.data or s }
end

-- Validates pack definition files including models, placements, and scenes.
function Schema.pack(p)
  if type(p) ~= 'table' then return nil, 'not an object' end
  if p.format and p.format ~= Schema.FORMAT then return nil, ('unknown format %s'):format(tostring(p.format)) end
  local id = p.id and Util.slug(p.id)
  if not id then return nil, 'missing id' end
  local out = {
    format = Schema.FORMAT, id = id,
    name = str(p.name, 80, id), version = str(p.version, 24, '1.0.0'),
    author = str(p.author, 80), description = str(p.description, 600), url = str(p.url, 200),
    models = {}, placements = {}, scenes = {},
  }
  local seen = {}
  for _, m in ipairs(type(p.models) == 'table' and p.models or {}) do
    local mm = Schema.model(m)
    if mm and not seen[mm.model] then seen[mm.model] = true out.models[#out.models + 1] = mm end
  end
  seen = {}
  for n, pl in ipairs(type(p.placements) == 'table' and p.placements or {}) do
    local pp = Schema.placement(pl)
    if pp then
      local key = Util.slug(pl.key or pl.id or (pp.model .. '_' .. n))
      local base, k = key, 2
      while seen[key] do key = base .. '_' .. k k = k + 1 end
      seen[key] = true
      pp.key, pp.id = key, nil
      out.placements[#out.placements + 1] = pp
    end
  end
  seen = {}
  for n, sc in ipairs(type(p.scenes) == 'table' and p.scenes or {}) do
    local ss = Schema.scene(sc)
    if ss then
      local key = Util.slug(sc.key or sc.id or ss.name or ('scene_' .. n))
      while seen[key] do key = key .. '_x' end
      seen[key] = true
      ss.key, ss.id = key, nil
      out.scenes[#out.scenes + 1] = ss
    end
  end
  return out
end
