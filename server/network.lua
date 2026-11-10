-- Server-authoritative entity synchronizer for networked placements using OneSync state bags.
Network = { ents = {}, sigs = {} }

local function wanted(p)
  if not p or p.enabled == false then return false end
  local prof = Store.profile(p.model)
  local mode = p.mode or prof.spawn.mode
  local rt = Store.runtime[p.id]
  return mode == 'networked' and not (rt and rt.hidden)
end

local function sig(p)
  local prof = Store.profile(p.model)
  local freeze = p.freeze
  if freeze == nil then freeze = prof.spawn.freeze end
  return Util.hash({ Store.modelOf(p), p.pos, p.rot, p.bucket or 0, freeze })
end

local function remove(id)
  local e = Network.ents[id]
  if e and DoesEntityExist(e) then DeleteEntity(e) end
  Network.ents[id], Network.sigs[id] = nil, nil
  local rt = Store.runtime[id]
  if rt then rt.netId = nil end
end

local function spawn(p)
  local hash = joaat(Store.modelOf(p))
  local e = CreateObjectNoOffset(hash, p.pos.x, p.pos.y, p.pos.z, true, true, false)
  local deadline = GetGameTimer() + 4000
  while not DoesEntityExist(e) and GetGameTimer() < deadline do Wait(10) end
  if not DoesEntityExist(e) then
    print(('^3[propkit]^7 could not create networked prop %s (%s)'):format(p.id, Store.modelOf(p)))
    return
  end
  local prof = Store.profile(p.model)
  local freeze = p.freeze
  if freeze == nil then freeze = prof.spawn.freeze end
  SetEntityCoords(e, p.pos.x, p.pos.y, p.pos.z, false, false, false, false)
  SetEntityRotation(e, p.rot.x, p.rot.y, p.rot.z, 2, true)
  FreezeEntityPosition(e, freeze)
  SetEntityRoutingBucket(e, p.bucket or 0)
  SetEntityOrphanMode(e, 2)
  Entity(e).state:set('propkit', p.id, true)
  Network.ents[p.id] = e
  Network.sigs[p.id] = sig(p)
  Store.runtime[p.id] = Store.runtime[p.id] or {}
  Store.runtime[p.id].netId = NetworkGetNetworkIdFromEntity(e)
end

-- Synchronizes server entity state, coordinates, and network ID with placement records.
function Network.sync(id)
  local p = Store.placements[id]
  if not wanted(p) then
    if Network.ents[id] then remove(id) Store.touch(id) end
    return
  end
  local e = Network.ents[id]
  if e and DoesEntityExist(e) and Network.sigs[id] == sig(p) then return end
  CreateThread(function()
    remove(id)
    local cur = Store.placements[id]
    if cur and wanted(cur) then spawn(cur) end
    Store.touch(id)
  end)
end

function Network.despawn(id) remove(id) end

function Network.modelChanged(model)
  for id, p in pairs(Store.placements) do
    if p.model == model then Network.sync(id) end
  end
end

function Network.start()
  for id in pairs(Store.placements) do Network.sync(id) end
  -- Periodic watchdog thread ensuring deleted server entities are respawned.
  CreateThread(function()
    while true do
      Wait(10000)
      for id, e in pairs(Network.ents) do
        if not DoesEntityExist(e) then
          Network.ents[id], Network.sigs[id] = nil, nil
          Network.sync(id)
        end
      end
    end
  end)
end

AddEventHandler('onResourceStop', function(name)
  if name ~= Util.RESOURCE then return end
  for _, e in pairs(Network.ents) do
    if DoesEntityExist(e) then DeleteEntity(e) end
  end
end)
