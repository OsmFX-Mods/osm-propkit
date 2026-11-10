-- Client lifecycle entry point and administrative hub management.
Hub = {}

local EVENT = Util.EVENT

local function me()
  local c = GetEntityCoords(PlayerPedId())
  return { x = c.x, y = c.y, z = c.z }
end

local function listPlacements()
  local out = {}
  for _, p in pairs(State.placements) do out[#out + 1] = p end
  return out
end

local function listModels()
  local out = {}
  for _, m in pairs(State.models) do out[#out + 1] = m end
  return out
end

-- Opens the administrative UI hub with optional view state restoration.
function Hub.open(view)
  if Editor.active or Studio.active then return end
  UI.open('hub', { perms = UI.perms, view = view, me = me() })
end

RegisterNetEvent(EVENT .. 'open', function(screen, perms, arg)
  UI.perms = perms or UI.perms
  if screen == 'studio' then
    Studio.start({ model = arg })
  else
    Hub.open()
  end
end)

-- Administrative hub NUI callbacks.

RegisterNUICallback('hub:data', function(_, cb)
  cb({ models = listModels(), placements = listPlacements(), me = me(), perms = UI.perms })
end)

RegisterNUICallback('hub:highlight', function(d, cb)
  Stream.highlight(d.id)
  cb(true)
end)

RegisterNUICallback('hub:goto', function(d, cb)
  cb(true)
  local p = State.placements[d.id]
  if not p then return end
  local ped = PlayerPedId()
  local pos = p.pos
  UI.close()
  DoScreenFadeOut(250)
  Wait(260)
  SetFocusPosAndVel(pos.x, pos.y, pos.z, 0.0, 0.0, 0.0)
  RequestCollisionAtCoord(pos.x, pos.y, pos.z)
  SetEntityCoords(ped, pos.x + 1.2, pos.y + 1.2, pos.z + 0.5, false, false, false, false)
  local t = GetGameTimer() + 2500
  while not HasCollisionLoadedAroundEntity(ped) and GetGameTimer() < t do Wait(50) end
  local ok, gz = GetGroundZFor_3dCoord(pos.x + 1.2, pos.y + 1.2, pos.z + 2.0, false)
  if ok then SetEntityCoords(ped, pos.x + 1.2, pos.y + 1.2, gz, false, false, false, false) end
  ClearFocus()
  DoScreenFadeIn(250)
end)

RegisterNUICallback('hub:place', function(d, cb)
  cb(true)
  UI.close()
  Stream.highlight(nil)
  SetTimeout(50, function() Editor.begin({ model = d.model, group = d.group }) end)
end)

RegisterNUICallback('hub:edit', function(d, cb)
  cb(true)
  UI.close()
  Stream.highlight(nil)
  SetTimeout(50, function() Editor.begin({ id = d.id }) end)
end)

-- Opens point selection mode for editing prop interactions.
RegisterNUICallback('hub:points', function(d, cb)
  cb(true)
  UI.close()
  Stream.highlight(nil)
  SetTimeout(50, function() Editor.begin({ id = d.id, model = d.model, points = d.interaction or true }) end)
end)

RegisterNUICallback('hub:test', function(d, cb)
  cb({ ok = Interact.test(d.id, d.interaction) })
  if d.close then UI.close() end
end)

RegisterNUICallback('hub:studio', function(d, cb)
  cb(true)
  UI.close()
  Stream.highlight(nil)
  SetTimeout(50, function() Studio.start({ model = d.model, scene = d.scene }) end)
end)

-- Verifies model existence in game assets and retrieves bounding dimensions.
RegisterNUICallback('hub:modelInfo', function(d, cb)
  local hash = joaat(d.model or '')
  if not IsModelInCdimage(hash) then return cb({ ok = false }) end
  local mn, mx = GetModelDimensions(hash)
  if mn.x == 0.0 and mx.x == 0.0 then
    local h = Stream.loadModel(hash)
    if h then mn, mx = GetModelDimensions(h) SetModelAsNoLongerNeeded(h) end
  end
  cb({ ok = true, hash = hash, size = { x = mx.x - mn.x, y = mx.y - mn.y, z = mx.z - mn.z } })
end)

-- Propagates real-time state deltas to the active hub interface.
State.on(function(kind, up, rm)
  if UI.screen ~= 'hub' then return end
  if kind == 'reset' then UI.send('hub:delta', { kind = 'reset', models = listModels(), placements = listPlacements() })
  else UI.send('hub:delta', { kind = kind, up = up or {}, rm = rm or {} }) end
end)

-- Periodically streams local player coordinates to the UI.
CreateThread(function()
  while true do
    if UI.screen == 'hub' then
      UI.send('me', me())
      Wait(1000)
    else
      Wait(500)
    end
  end
end)

-- Client initialization routines.

CreateThread(function()
  while not NetworkIsPlayerActive(PlayerId()) do Wait(500) end
  State.bootstrap()
end)

-- Re-synchronizes state upon character selection or login.
RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function() State.bootstrap() end)
RegisterNetEvent('esx:playerLoaded', function() State.bootstrap() end)

-- Validates internal rotation matrix calculations against GTA V natives.
RegisterCommand('propkit_rottest', function()
  local hash = Stream.loadModel('prop_mp_cone_02')
  if not hash then return end
  local c = GetEntityCoords(PlayerPedId())
  local e = CreateObjectNoOffset(hash, c.x, c.y, c.z + 2.0, false, false, false)
  local worst = 0.0
  for _, r in ipairs({ { 10, 20, 30 }, { -35, 50, 120 }, { 80, -10, -60 }, { 5, 170, 45 } }) do
    SetEntityRotation(e, r[1] + 0.0, r[2] + 0.0, r[3] + 0.0, 2, false)
    Wait(0)
    local fwd, right, up = GetEntityMatrix(e)
    local R, F, U = Rot.basis({ x = r[1], y = r[2], z = r[3] })
    for _, pair in ipairs({ { right, R }, { fwd, F }, { up, U } }) do
      local a, b = pair[1], pair[2]
      local d = math.abs(a.x - b.x) + math.abs(a.y - b.y) + math.abs(a.z - b.z)
      if d > worst then worst = d end
    end
  end
  DeleteEntity(e)
  print(('[propkit] rotation self-test: largest difference %.5f (%s)'):format(worst, worst < 0.01 and 'ok' or 'MISMATCH, report this'))
end, false)
