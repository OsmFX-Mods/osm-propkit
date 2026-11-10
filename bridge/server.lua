-- Server framework, inventory, permissions, and currency integration.
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
Bridge.inventory = INV

local QB, ESX
if FW == 'qb' then QB = exports['qb-core']:GetCoreObject() end
if FW == 'esx' then ESX = exports['es_extended']:getSharedObject() end

local function qbPlayer(src)
  if FW == 'qbx' then return exports.qbx_core:GetPlayer(src) end
  if FW == 'qb' then return QB.Functions.GetPlayer(src) end
end

-- Returns a persistent player identifier for cooldowns and tracking.
function Bridge.identifier(src)
  if FW == 'qbx' or FW == 'qb' then
    local p = qbPlayer(src)
    return p and p.PlayerData.citizenid or ('src:' .. src)
  elseif FW == 'esx' then
    local x = ESX.GetPlayerFromId(src)
    return x and x.identifier or ('src:' .. src)
  end
  return GetPlayerIdentifierByType(src, 'license') or ('src:' .. src)
end

-- Returns player job and gang permissions with grade levels.
function Bridge.groups(src)
  local out = {}
  if FW == 'qbx' or FW == 'qb' then
    local p = qbPlayer(src)
    if not p then return out end
    local d = p.PlayerData
    if d.job then out[d.job.name] = d.job.grade and (d.job.grade.level or d.job.grade) or 0 end
    if d.gang then out[d.gang.name] = d.gang.grade and (d.gang.grade.level or d.gang.grade) or 0 end
    if FW == 'qbx' then
      local ok, groups = pcall(function() return exports.qbx_core:GetGroups(src) end)
      if ok and type(groups) == 'table' then for k, v in pairs(groups) do out[k] = v end end
    end
  elseif FW == 'esx' then
    local x = ESX.GetPlayerFromId(src)
    if x and x.job then out[x.job.name] = x.job.grade or 0 end
  elseif FW == 'ox' then
    local ok, player = pcall(function() return exports.ox_core:GetPlayer(src) end)
    if ok and player and player.getGroups then
      for k, v in pairs(player.getGroups() or {}) do out[k] = v end
    end
  end
  return out
end

-- Checks whether a player possesses required ACE or framework permissions.
function Bridge.allowed(src, perm)
  local p = Config.Permissions[perm] or Config.Permissions.edit
  if src == 0 then return true end
  if p.ace and IsPlayerAceAllowed(src, p.ace) then return true end
  if IsPlayerAceAllowed(src, 'command') then return true end
  for _, g in ipairs(p.groups or {}) do
    if FW == 'qbx' or FW == 'qb' then
      if IsPlayerAceAllowed(src, g) then return true end
      if FW == 'qb' and QB.Functions.HasPermission(src, g) then return true end
    elseif FW == 'esx' then
      local x = ESX.GetPlayerFromId(src)
      if x and x.getGroup and x.getGroup() == g then return true end
    end
  end
  return false
end

-- Item inventory helpers.

function Bridge.itemCount(src, item)
  if INV == 'ox' then return exports.ox_inventory:Search(src, 'count', item) or 0 end
  if FW == 'qbx' or FW == 'qb' then
    local p = qbPlayer(src)
    if not p then return 0 end
    local total = 0
    for _, it in pairs(p.PlayerData.items or {}) do
      if it and it.name == item then total = total + (it.amount or it.count or 0) end
    end
    return total
  elseif FW == 'esx' then
    local x = ESX.GetPlayerFromId(src)
    local it = x and x.getInventoryItem(item)
    return it and (it.count or 0) or 0
  end
  return 0
end

function Bridge.addItem(src, item, count, metadata)
  if INV == 'ox' then
    if not exports.ox_inventory:CanCarryItem(src, item, count, metadata) then return false end
    return exports.ox_inventory:AddItem(src, item, count, metadata) and true or false
  end
  if FW == 'qbx' or FW == 'qb' then
    local p = qbPlayer(src)
    return p and p.Functions.AddItem(item, count, false, metadata) or false
  elseif FW == 'esx' then
    local x = ESX.GetPlayerFromId(src)
    if not x then return false end
    if x.canCarryItem and not x.canCarryItem(item, count) then return false end
    x.addInventoryItem(item, count, metadata)
    return true
  end
  return false
end

function Bridge.removeItem(src, item, count)
  if Bridge.itemCount(src, item) < count then return false end
  if INV == 'ox' then return exports.ox_inventory:RemoveItem(src, item, count) and true or false end
  if FW == 'qbx' or FW == 'qb' then
    local p = qbPlayer(src)
    return p and p.Functions.RemoveItem(item, count) or false
  elseif FW == 'esx' then
    local x = ESX.GetPlayerFromId(src)
    if not x then return false end
    x.removeInventoryItem(item, count)
    return true
  end
  return false
end

-- Currency account helpers.

local ESX_ACCOUNT = { cash = 'money', bank = 'bank', black_money = 'black_money' }

function Bridge.addMoney(src, account, amount)
  if FW == 'qbx' then return exports.qbx_core:AddMoney(src, account, amount, 'osm-propkit') and true or false end
  if FW == 'qb' then local p = qbPlayer(src) return p and p.Functions.AddMoney(account, amount, 'osm-propkit') or false end
  if FW == 'esx' then
    local x = ESX.GetPlayerFromId(src)
    if not x then return false end
    x.addAccountMoney(ESX_ACCOUNT[account] or account, amount)
    return true
  end
  if INV == 'ox' and account == 'cash' then return exports.ox_inventory:AddItem(src, 'money', amount) and true or false end
  return false
end

function Bridge.removeMoney(src, account, amount)
  if FW == 'qbx' then return exports.qbx_core:RemoveMoney(src, account, amount, 'osm-propkit') and true or false end
  if FW == 'qb' then local p = qbPlayer(src) return p and p.Functions.RemoveMoney(account, amount, 'osm-propkit') or false end
  if FW == 'esx' then
    local x = ESX.GetPlayerFromId(src)
    if not x then return false end
    local acc = x.getAccount(ESX_ACCOUNT[account] or account)
    if not acc or acc.money < amount then return false end
    x.removeAccountMoney(ESX_ACCOUNT[account] or account, amount)
    return true
  end
  if INV == 'ox' and account == 'cash' then return Bridge.removeItem(src, 'money', amount) end
  return false
end

function Bridge.notify(src, text, kind)
  TriggerClientEvent('ox_lib:notify', src, { description = text, type = kind or 'inform' })
end
