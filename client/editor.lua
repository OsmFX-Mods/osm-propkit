-- Prop placement editor handling preview entities, raycasts, ground alignment, and anchors.
Editor = { active = false }

local s -- session: { kind, id, model, hash, entity, pos, rot, settings, anchor, dims, points }

local function v(x, y, z) return { x = x + 0.0, y = y + 0.0, z = z + 0.0 } end
local function vec3of(t) return vector3(t.x, t.y, t.z) end

local function dims(hash)
  local mn, mx = GetModelDimensions(hash)
  return { min = v(mn.x, mn.y, mn.z), max = v(mx.x, mx.y, mx.z) }
end

local function makePreview(hash, pos, rot)
  local e = CreateObjectNoOffset(hash, pos.x, pos.y, pos.z, false, false, false)
  SetEntityCoordsNoOffset(e, pos.x, pos.y, pos.z, false, false, false)
  SetEntityRotation(e, rot.x, rot.y, rot.z, 2, false)
  FreezeEntityPosition(e, true)
  SetEntityCollision(e, true, true)
  SetEntityInvincible(e, true)
  SetEntityCanBeDamaged(e, false)
  SetEntityLodDist(e, 1000)
  local c = Config.Editor.outline
  SetEntityDrawOutlineColor(c[1], c[2], c[3], c[4])
  SetEntityDrawOutlineShader(1)
  SetEntityDrawOutline(e, true)
  return e
end

local function apply()
  if not (s and s.entity and DoesEntityExist(s.entity)) then return end
  SetEntityCoordsNoOffset(s.entity, s.pos.x, s.pos.y, s.pos.z, false, false, false)
  SetEntityRotation(s.entity, s.rot.x, s.rot.y, s.rot.z, 2, false)
  if s.settings.alpha and s.settings.alpha < 255 then SetEntityAlpha(s.entity, s.settings.alpha, false) else ResetEntityAlpha(s.entity) end
end

-- Calculates the lowest point of the rotated bounding box for precise ground resting.
local function lowestOffset(rot, d)
  local right, fwd, up = Rot.basis(rot)
  local lo = math.huge
  for _, x in ipairs({ d.min.x, d.max.x }) do
    for _, y in ipairs({ d.min.y, d.max.y }) do
      for _, z in ipairs({ d.min.z, d.max.z }) do
        local wz = right.z * x + fwd.z * y + up.z * z
        if wz < lo then lo = wz end
      end
    end
  end
  return lo
end

local function ray(from, to, flags, ignore)
  local h = StartExpensiveSynchronousShapeTestLosProbe(from.x, from.y, from.z, to.x, to.y, to.z, flags or -1, ignore or 0, 7)
  local _, hit, pos, normal, ent = GetShapeTestResult(h)
  return hit == 1, pos, normal, ent
end

local function groundBelow(pos, ignore)
  local hit, at = ray(v(pos.x, pos.y, pos.z + 1.5), v(pos.x, pos.y, pos.z - 80.0), 1 | 16, ignore)
  if hit then return at.z end
  local ok, z = GetGroundZFor_3dCoord(pos.x, pos.y, pos.z + 1.5, false)
  if ok then return z end
end

local function placementPoints(model, id)
  local out = {}
  local p = id and State.placements[id]
  local list = p and State.interactionsOf(p) or {}
  if not p then
    local m = State.models[model]
    for _, i in ipairs(m and m.interactions or {}) do list[#list + 1] = { i = i } end
  end
  for _, e in ipairs(list) do
    if e.i.point then out[#out + 1] = { id = e.i.id, label = e.i.label, point = e.i.point, radius = e.i.radius } end
  end
  return out
end

-- Computes relative offset and rotation against an anchor entity.
local function anchorFrom(entity)
  if not entity or entity == 0 or not DoesEntityExist(entity) then return nil end
  local c, r = GetEntityCoords(entity), GetEntityRotation(entity, 2)
  local apos, arot = v(c.x, c.y, c.z), v(r.x, r.y, r.z)
  local offset, localRot = Rot.relative(apos, arot, s.pos, s.rot)
  return {
    model = GetEntityModel(entity), pos = Util.pos(apos), rot = Util.rot(arot),
    offset = Util.pos(offset), local_rot = Util.rot(localRot), radius = 1.5,
    entity = entity,
  }
end

local function view()
  return {
    kind = s.kind, id = s.id, model = s.model, label = s.settings.label or (State.models[s.model] or {}).label or s.model,
    pos = s.pos, rot = s.rot, dims = s.dims, settings = s.settings,
    anchor = s.anchor and { model = s.anchor.model, pos = s.anchor.pos } or nil,
    points = placementPoints(s.model, s.id), pointsOnly = s.kind == 'points',
    focus = s.focus,
  }
end

-- Editor session lifecycle.

-- Initializes an editing session for a placement, new model, or interaction point.
function Editor.begin(opts)
  if Editor.active then return end
  if Studio and Studio.active then return end
  local ped = PlayerPedId()
  local p = opts.id and State.placements[opts.id]
  local model = p and (p.swap or p.model) or opts.model
  if not model then return end
  local hash = Stream.loadModel(model)
  if not hash then UI.toast(Locale.noModel, 'error') return end

  local pos, rot
  if p then
    local l = Stream.live[p.id]
    if l and DoesEntityExist(l.entity) then
      local c, r = GetEntityCoords(l.entity), GetEntityRotation(l.entity, 2)
      pos, rot = v(c.x, c.y, c.z), v(r.x, r.y, r.z)
    else
      pos, rot = Stream.resolve(p)
    end
    pos, rot = Util.copy(p.anchor and pos or p.pos), Util.copy(p.anchor and rot or p.rot)
  else
    local fwd = GetEntityForwardVector(ped)
    local c = GetEntityCoords(ped)
    local at = v(c.x + fwd.x * 2.0, c.y + fwd.y * 2.0, c.z)
    pos = Util.copy(opts.pos or at)
    rot = Util.copy(opts.rot or v(0.0, 0.0, Util.round(GetEntityHeading(ped) + 180.0, 1) % 360.0))
  end

  s = {
    kind = opts.points and 'points' or 'placement', id = p and p.id or nil, model = model, hash = hash,
    pos = pos, rot = rot, dims = dims(hash), focus = opts.points,
    settings = {
      label = p and p.label or nil, group = p and p.group or opts.group, mode = p and p.mode or nil,
      distance = p and p.distance or nil, lod = p and p.lod or nil, collision = p and p.collision, freeze = p and p.freeze,
      alpha = p and p.alpha or nil, inherit = p == nil or p.inherit ~= false, enabled = p == nil or p.enabled ~= false,
    },
    keep = p and { interactions = p.interactions, meta = p.meta, bucket = p.bucket, interior = p.interior } or {},
  }
  if p and p.anchor then
    local hashA = type(p.anchor.model) == 'number' and p.anchor.model or joaat(p.anchor.model)
    local obj = GetClosestObjectOfType(p.anchor.pos.x, p.anchor.pos.y, p.anchor.pos.z, p.anchor.radius or 1.5, hashA, false, false, false)
    s.anchor = obj ~= 0 and anchorFrom(obj) or { model = hashA, pos = p.anchor.pos, rot = p.anchor.rot, offset = p.anchor.offset, local_rot = p.anchor.local_rot, radius = p.anchor.radius }
  end

  if p then Stream.hold(p.id, true) end
  -- Freezes player ped during editing.
  FreezeEntityPosition(ped, true)
  s.entity = makePreview(hash, pos, rot)
  Editor.active = true

  Cam.fromGameplay()
  local center = v(pos.x, pos.y, pos.z + (s.dims.max.z + s.dims.min.z) * 0.5)
  local radius = math.max(0.4, Util.dist(s.dims.min, s.dims.max) * 0.5)
  Cam.focus(center, radius * (opts.points and 1.1 or 1.6))
  UI.open('editor', view())
end

local function finish()
  if not s then return end
  if s.entity and DoesEntityExist(s.entity) then DeleteEntity(s.entity) end
  if s.id then Stream.hold(s.id, false) end
  FreezeEntityPosition(PlayerPedId(), false)
  Cam.stop()
  local back = s.back
  s = nil
  Editor.active = false
  UI.close()
  if back then SetTimeout(450, function() Hub.open(back) end) end
end

function Editor.cancel() finish() end

-- NUI editor callbacks.

RegisterNUICallback('editor:set', function(d, cb)
  cb(true)
  if not s then return end
  s.pos = Util.vec(d.pos, s.pos)
  s.rot = Util.vec(d.rot, s.rot)
  if s.anchor and s.anchor.entity then
    local a = anchorFrom(s.anchor.entity)
    if a then s.anchor = a end
  end
  apply()
end)

RegisterNUICallback('editor:settings', function(d, cb)
  cb(true)
  if not s or type(d) ~= 'table' then return end
  for k, val in pairs(d) do s.settings[k] = val end
  apply()
end)

-- Performs raycasts for surfaces, world entities, and prop interaction points.
RegisterNUICallback('editor:raycast', function(d, cb)
  if not s then return cb({ hit = false }) end
  local o, dir = Util.vec(d.o), Util.vec(d.d)
  if not (o and dir) then return cb({ hit = false }) end
  local far = v(o.x + dir.x * 300.0, o.y + dir.y * 300.0, o.z + dir.z * 300.0)
  local mode = d.mode or 'surface'
  local hit, pos, normal, ent = ray(o, far, -1, mode == 'surface' and s.entity or 0)
  if not hit then return cb({ hit = false }) end
  local out = { hit = true, pos = v(pos.x, pos.y, pos.z), normal = v(normal.x, normal.y, normal.z) }
  if mode == 'prop' then
    if ent ~= s.entity then return cb({ hit = false }) end
    local l = GetOffsetFromEntityGivenWorldCoords(s.entity, pos.x, pos.y, pos.z)
    out.local_ = Util.pos(v(l.x, l.y, l.z))
  elseif mode == 'pick' and ent ~= 0 and DoesEntityExist(ent) and GetEntityType(ent) == 3 and ent ~= s.entity then
    out.entity = ent
    out.model = GetEntityModel(ent)
    local c = GetEntityCoords(ent)
    out.entityPos = v(c.x, c.y, c.z)
    for id, l in pairs(Stream.live) do if l.entity == ent then out.placement = id end end
  end
  cb(out)
end)

-- Snaps the prop to terrain or geometry below, with optional normal alignment.
RegisterNUICallback('editor:ground', function(d, cb)
  if not s then return cb({ ok = false }) end
  local pos = Util.vec(d.pos, s.pos)
  local rot = Util.vec(d.rot, s.rot)
  local hit, at, normal = ray(v(pos.x, pos.y, pos.z + 1.0), v(pos.x, pos.y, pos.z - 80.0), 1 | 16, s.entity)
  if not hit then
    local z = groundBelow(pos, s.entity)
    if not z then return cb({ ok = false, msg = 'No ground below, fly closer so it loads.' }) end
    at, normal = vector3(pos.x, pos.y, z), vector3(0.0, 0.0, 1.0)
  end
  if d.align then
    -- Tilts rotation to align with the surface normal while preserving heading.
    local n = v(normal.x, normal.y, normal.z)
    local _, fwd0 = Rot.basis(v(0.0, 0.0, rot.z))
    local dotFN = fwd0.x * n.x + fwd0.y * n.y + fwd0.z * n.z
    local f = v(fwd0.x - n.x * dotFN, fwd0.y - n.y * dotFN, fwd0.z - n.z * dotFN)
    local fl = math.sqrt(f.x * f.x + f.y * f.y + f.z * f.z)
    f = v(f.x / fl, f.y / fl, f.z / fl)
    local r = v(f.y * n.z - f.z * n.y, f.z * n.x - f.x * n.z, f.x * n.y - f.y * n.x)
    rot = Rot.euler(r, f, n)
  end
  local low = lowestOffset(rot, s.dims)
  pos = v(pos.x, pos.y, at.z - low + Config.Editor.surfaceOffset)
  cb({ ok = true, pos = Util.pos(pos), rot = Util.rot(rot) })
end)

-- Attaches placement relative to a detected map object.
RegisterNUICallback('editor:anchor', function(d, cb)
  if not s then return cb({ ok = false }) end
  if d.clear then s.anchor = nil return cb({ ok = true }) end
  local a = anchorFrom(tonumber(d.entity))
  if not a then return cb({ ok = false }) end
  s.anchor = a
  cb({ ok = true, anchor = { model = a.model, pos = a.pos } })
end)

-- Sends periodic positional and interior diagnostic data to the UI.
CreateThread(function()
  while true do
    if s and Editor.active then
      local z = groundBelow(s.pos, s.entity)
      local low = lowestOffset(s.rot, s.dims)
      local me = GetEntityCoords(PlayerPedId())
      local int = DoesEntityExist(s.entity) and GetInteriorFromEntity(s.entity) or 0
      UI.send('editor:info', {
        ground = z and Util.round(s.pos.z + low - z, 3) or nil,
        dist = Util.round(#(vec3of(s.pos) - me), 1),
        interior = int ~= 0,
        reach = Config.Editor.reach,
      })
      Wait(100)
    else
      Wait(400)
    end
  end
end)

-- Placement serialization and save routines.

local function build(d)
  local st = s.settings
  local p = {
    id = d.asNew and nil or s.id, model = s.model, pos = Util.pos(s.pos), rot = Util.rot(s.rot),
    label = st.label ~= '' and st.label or nil, group = st.group ~= '' and st.group or nil,
    mode = st.mode, distance = st.distance, lod = st.lod, collision = st.collision, freeze = st.freeze, alpha = st.alpha,
    inherit = st.inherit, enabled = st.enabled,
    interactions = s.keep.interactions, meta = s.keep.meta, bucket = s.keep.bucket,
  }
  if s.anchor then
    local a = s.anchor.entity and anchorFrom(s.anchor.entity) or s.anchor
    p.anchor = { model = a.model, pos = a.pos, rot = a.rot, offset = a.offset, local_rot = a.local_rot, radius = a.radius or 1.5 }
  end
  -- Resolves interior name hash and room key for persistence.
  local int = DoesEntityExist(s.entity) and GetInteriorFromEntity(s.entity) or 0
  if int ~= 0 then
    local _, nameHash = GetInteriorLocationAndNamehash(int)
    p.interior = { hash = nameHash, room = GetRoomKeyFromEntity(s.entity) }
  else
    p.interior = nil
  end
  return p
end

RegisterNUICallback('editor:save', function(d, cb)
  if not s then return cb({ ok = false }) end
  if s.kind == 'points' then return cb({ ok = false }) end
  s.pos = Util.vec(d.pos, s.pos)
  s.rot = Util.vec(d.rot, s.rot)
  local res = UI.rpc('placement:save', { placement = build(d) })
  if not res or not res.ok then return cb(res or { ok = false }) end
  cb(res)
  if d.another then
    -- Resets session ID to allow continuous placement stamping.
    if s.id then Stream.hold(s.id, false) end
    s.id = nil
    s.anchor = nil
    UI.send('editor:saved', { id = res.placement.id, next = true })
  else
    s.back = d.back
    finish()
  end
end)

RegisterNUICallback('editor:cancel', function(d, cb)
  cb(true)
  if s then s.back = d and d.back end
  finish()
end)

-- Finishes point picking and returns to the interaction editor.
RegisterNUICallback('editor:points:done', function(d, cb)
  cb(true)
  if not s then return end
  s.back = d.back
  finish()
end)

-- Swaps the preview entity model during an active editing session.
RegisterNUICallback('editor:model', function(d, cb)
  if not s then return cb({ ok = false }) end
  local hash = Stream.loadModel(d.model)
  if not hash then return cb({ ok = false, msg = Locale.noModel }) end
  if DoesEntityExist(s.entity) then DeleteEntity(s.entity) end
  s.model, s.hash, s.dims = d.model, hash, dims(hash)
  s.entity = makePreview(hash, s.pos, s.rot)
  apply()
  cb({ ok = true, dims = s.dims })
end)

AddEventHandler('onResourceStop', function(name)
  if name ~= Util.RESOURCE or not s then return end
  if s.entity and DoesEntityExist(s.entity) then DeleteEntity(s.entity) end
  FreezeEntityPosition(PlayerPedId(), false)
end)
