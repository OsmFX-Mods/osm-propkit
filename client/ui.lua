-- NUI bridge managing screen routing, input focus, and server RPC pass-through.
UI = { screen = nil, perms = {} }

local EVENT = Util.EVENT

function UI.send(action, data)
  SendNUIMessage({ action = action, data = data })
end

function UI.toast(text, kind)
  UI.send('toast', { text = text, kind = kind or 'info' })
end

-- Dispatches server RPC requests with permission verification.
function UI.rpc(name, args)
  return lib.callback.await(EVENT .. 'rpc', false, name, args or {})
end

RegisterNUICallback('rpc', function(d, cb)
  cb(UI.rpc(d.name, d.args) or { ok = false })
end)

function UI.open(screen, data)
  UI.screen = screen
  SetNuiFocus(true, true)
  SetNuiFocusKeepInput(false)
  UI.send('screen', { screen = screen, data = data })
end

function UI.close()
  local was = UI.screen
  UI.screen = nil
  SetNuiFocus(false, false)
  UI.send('screen', { screen = nil })
  return was
end

-- Supplies bootstrap configuration data to the NUI frontend.
RegisterNUICallback('boot', function(_, cb)
  cb({
    catalog = Catalog,
    strings = Locale.ui,
    target = Target.name,
    framework = Bridge.framework,
    editor = { snapMove = Config.Editor.snapMove, snapTurn = Config.Editor.snapTurn, reach = Config.Editor.reach },
    interact = { accounts = Config.Interact.moneyAccounts, commands = Config.Interact.allowCommands, exports = Config.Interact.allowExports, maxSteps = Config.Interact.maxSteps },
    studio = { upload = Config.Studio.upload.type, thumbSize = Config.Studio.thumbSize },
    stream = { distance = Config.Stream.defaultDistance, lod = Config.Stream.defaultLod },
    perms = UI.perms,
  })
end)

-- Handles NUI close events with context-specific teardown.
RegisterNUICallback('close', function(_, cb)
  cb(true)
  local was = UI.screen
  if was == 'editor' then Editor.cancel()
  elseif was == 'studio' then Studio.stop()
  else UI.close() end
end)

-- Disables pause menu controls while an active NUI screen is open.
CreateThread(function()
  while true do
    if UI.screen then
      DisableControlAction(0, 200, true)
      DisableControlAction(0, 199, true)
      Wait(0)
    else
      Wait(250)
    end
  end
end)
