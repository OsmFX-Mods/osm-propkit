-- Target system bridge for osm-target, ox_target, and qb-target.
Target = {}

local function started(name) return GetResourceState(name) == 'started' end

local function pick()
  local want = Config.Target
  if want ~= 'auto' then return want end
  if started('osm-target') then return 'osm' end
  if started('ox_target') then return 'ox' end
  if started('qb-target') then return 'qb' end
  return 'none'
end

Target.name = pick()

local function res()
  if Target.name == 'osm' then return 'osm-target' end
  if Target.name == 'ox' then return 'ox_target' end
  return 'qb-target'
end

-- Converts options to ox_target and osm-target compatible schema.
local function oxOption(o)
  return {
    name = o.name, label = o.label, icon = o.icon, iconColor = o.iconColor,
    description = Target.name == 'osm' and o.description or nil,
    distance = o.distance, bones = o.bones,
    offset = o.point and vec3(o.point.x, o.point.y, o.point.z) or nil, absoluteOffset = o.point and true or nil, offsetSize = o.point and o.radius or nil,
    canInteract = function(entity, distance) return o.canInteract(entity, distance) end,
    onSelect = function(data) o.onSelect(data.entity, data.coords) end,
  }
end

local function qbOption(o)
  return {
    num = o.order, label = o.label, icon = o.icon, distance = o.distance,
    canInteract = function(entity, distance) return o.canInteract(entity, distance) end,
    action = function(entity) o.onSelect(entity, entity and GetEntityCoords(entity)) end,
  }
end

-- Registers target options for a specific spawned entity.
function Target.addEntity(entity, options)
  if Target.name == 'none' or not DoesEntityExist(entity) then return nil end
  local handle = { entity = entity, names = {}, labels = {}, zones = {} }
  if Target.name == 'osm' or Target.name == 'ox' then
    local list = {}
    for _, o in ipairs(options) do
      list[#list + 1] = oxOption(o)
      handle.names[#handle.names + 1] = o.name
    end
    exports[res()]:addLocalEntity(entity, list)
  else
    local whole = {}
    for _, o in ipairs(options) do
      if o.point then
        local w = GetOffsetFromEntityInWorldCoords(entity, o.point.x, o.point.y, o.point.z)
        local zname = ('propkit_%s_%s'):format(entity, o.name)
        exports['qb-target']:AddCircleZone(zname, w, o.radius or 0.35, { name = zname, debugPoly = false, useZ = true }, {
          options = { qbOption(o) }, distance = o.distance,
        })
        handle.zones[#handle.zones + 1] = zname
      else
        whole[#whole + 1] = qbOption(o)
        handle.labels[#handle.labels + 1] = o.label
      end
    end
    if #whole > 0 then
      local maxD = 0
      for _, o in ipairs(whole) do if o.distance > maxD then maxD = o.distance end end
      exports['qb-target']:AddTargetEntity(entity, { options = whole, distance = maxD })
    end
  end
  return handle
end

function Target.removeEntity(handle)
  if not handle or Target.name == 'none' then return end
  if Target.name == 'osm' or Target.name == 'ox' then
    if DoesEntityExist(handle.entity) then pcall(function() exports[res()]:removeLocalEntity(handle.entity, handle.names) end) end
  else
    if #handle.labels > 0 then pcall(function() exports['qb-target']:RemoveTargetEntity(handle.entity, handle.labels) end) end
    for _, z in ipairs(handle.zones) do pcall(function() exports['qb-target']:RemoveZone(z) end) end
  end
end

-- Registers target options for all world instances of a model.
function Target.addModel(model, options)
  if Target.name == 'none' then return nil end
  local hash = type(model) == 'number' and model or joaat(model)
  local handle = { model = hash, names = {}, labels = {} }
  if Target.name == 'osm' or Target.name == 'ox' then
    local list = {}
    for _, o in ipairs(options) do
      list[#list + 1] = oxOption(o)
      handle.names[#handle.names + 1] = o.name
    end
    exports[res()]:addModel(hash, list)
  else
    local list, maxD = {}, 0
    for _, o in ipairs(options) do
      list[#list + 1] = qbOption(o)
      handle.labels[#handle.labels + 1] = o.label
      if o.distance > maxD then maxD = o.distance end
    end
    exports['qb-target']:AddTargetModel(hash, { options = list, distance = maxD })
  end
  return handle
end

function Target.removeModel(handle)
  if not handle or Target.name == 'none' then return end
  if Target.name == 'osm' or Target.name == 'ox' then
    pcall(function() exports[res()]:removeModel(handle.model, handle.names) end)
  else
    pcall(function() exports['qb-target']:RemoveTargetModel(handle.model, handle.labels) end)
  end
end
