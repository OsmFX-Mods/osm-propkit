-- Client framework, inventory, notification, and progress bar integration.
Bridge = {}

local function started(name) return GetResourceState(name) == 'started' end

local FW = Config.Framework
if FW == 'auto' then
  if started('qbx_core') then FW = 'qbx'
  elseif started('qb-core') then FW = 'qb'
  elseif started('es_extended') then FW = 'esx'
  elseif started('ox_core') then FW = 'ox'
  else FW = 'standalone' end
end
Bridge.framework = FW

local INV = Config.Inventory
if INV == 'auto' then INV = started('ox_inventory') and 'ox' or 'framework' end

local QB, ESX
if FW == 'qb' then QB = exports['qb-core']:GetCoreObject() end
if FW == 'esx' then ESX = exports['es_extended']:getSharedObject() end

local function playerData()
  if FW == 'qbx' then return exports.qbx_core:GetPlayerData() end
  if FW == 'qb' then return QB.Functions.GetPlayerData() end
  if FW == 'esx' then return ESX.GetPlayerData() end
end

-- Returns player job and gang groups with grade levels.
function Bridge.groups()
  local out = {}
  local d = playerData()
  if not d then return out end
  if FW == 'qbx' or FW == 'qb' then
    if d.job then out[d.job.name] = d.job.grade and (d.job.grade.level or d.job.grade) or 0 end
    if d.gang then out[d.gang.name] = d.gang.grade and (d.gang.grade.level or d.gang.grade) or 0 end
  elseif FW == 'esx' then
    if d.job then out[d.job.name] = d.job.grade or 0 end
  end
  return out
end

function Bridge.itemCount(item)
  if INV == 'ox' then return exports.ox_inventory:Search('count', item) or 0 end
  local d = playerData()
  if not d then return 0 end
  local total = 0
  for _, it in pairs(d.items or d.inventory or {}) do
    if it and it.name == item then total = total + (it.amount or it.count or 0) end
  end
  return total
end

function Bridge.notify(text, kind)
  lib.notify({ description = text, type = kind == 'info' and 'inform' or kind or 'inform' })
end

-- Displays a progress bar or circle and returns true on completion.
function Bridge.progress(o)
  local anim
  if o.anim and o.anim.scenario then anim = { scenario = o.anim.scenario }
  elseif o.anim then anim = { dict = o.anim.dict, clip = o.anim.clip, flag = o.anim.flag or 1 } end
  local prop
  if o.prop then
    prop = { model = o.prop.model, bone = o.prop.bone, pos = vec3(o.prop.pos.x, o.prop.pos.y, o.prop.pos.z), rot = vec3(o.prop.rot.x, o.prop.rot.y, o.prop.rot.z) }
  end
  local kind = Config.Interact.progress
  if kind == 'qb' and FW == 'qb' then
    local p = promise.new()
    QB.Functions.Progressbar('osm_propkit', o.label, o.duration, false, o.canCancel ~= false,
      { disableMovement = o.freeze ~= false, disableCarMovement = true, disableMouse = false, disableCombat = true },
      anim and anim.dict and { animDict = anim.dict, anim = anim.clip, flags = anim.flag } or {}, {}, {},
      function() p:resolve(true) end, function() p:resolve(false) end)
    return Citizen.Await(p)
  end
  local data = {
    duration = o.duration, label = o.label, useWhileDead = false, canCancel = o.canCancel ~= false,
    disable = { move = o.freeze ~= false, car = true, combat = true }, anim = anim, prop = prop,
  }
  if kind == 'circle' then return lib.progressCircle(data) end
  return lib.progressBar(data)
end
