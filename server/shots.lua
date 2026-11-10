-- Studio capture processor receiving chunked base64 images, writing to disk, and managing thumbnails.
Shots = { incoming = {} }

local EVENT = Util.EVENT
local fs = exports[Util.RESOURCE]

local MIME = { png = 'image/png', webp = 'image/webp', jpg = 'image/jpeg', webm = 'video/webm' }

-- Initiates an incoming chunked capture upload session.
lib.callback.register(EVENT .. 'shot:begin', function(src, meta)
  if not Bridge.allowed(src, 'studio') then return { ok = false, msg = Locale.notAdmin } end
  if type(meta) ~= 'table' then return { ok = false } end
  local total = tonumber(meta.chunks) or 0
  local size = tonumber(meta.size) or 0
  if total < 1 or total > 2000 or size > Config.Studio.maxUpload * 1024 * 1024 * 1.4 then return { ok = false, msg = 'Image too large.' } end
  local ext = MIME[meta.ext] and meta.ext or 'png'
  local id = Util.id('sh')
  Shots.incoming[id] = { src = src, total = total, got = 0, parts = {}, meta = meta, ext = ext, at = os.time() }
  return { ok = true, id = id }
end)

local function finish(id)
  local s = Shots.incoming[id]
  Shots.incoming[id] = nil
  local meta = s.meta
  local day = os.date('%Y-%m-%d')
  local base = Util.slug(meta.name or meta.model or 'shot')
  local file = ('%s/%s/%s_%s.%s'):format(Config.Studio.shotsFolder, day, base, os.date('%H%M%S'), s.ext)
  local res = fs:fsWriteBase64(file, table.concat(s.parts))
  if not res then
    TriggerClientEvent(EVENT .. 'shot:done', s.src, id, { ok = false, msg = 'Could not write the file.' })
    return
  end
  local shot = {
    id = id, file = file, model = meta.model, scene = meta.scene, width = tonumber(meta.width), height = tonumber(meta.height),
    bytes = res.bytes, thumb = type(meta.thumb) == 'string' and #meta.thumb < 400000 and meta.thumb or nil, by = Bridge.identifier(s.src),
  }
  if s.ext ~= 'webm' then Db.saveShot(shot) end
  local out = { ok = true, id = id, file = file, path = res.path, bytes = res.bytes }
  local up = Config.Studio.upload
  if up.type ~= 'none' and (meta.upload ~= false) then
    fs:upload({ type = up.type, url = up.url, token = up.token, field = up.field, message = meta.caption or '' }, file, base .. '.' .. s.ext, MIME[s.ext], function(ok, link)
      if ok and link ~= '' then Db.shotUrl(id, link) end
      TriggerClientEvent(EVENT .. 'shot:uploaded', s.src, id, ok, link)
    end)
  end
  TriggerClientEvent(EVENT .. 'shot:done', s.src, id, out)
end

RegisterNetEvent(EVENT .. 'shot:chunk', function(id, index, data)
  local src = source
  local s = Shots.incoming[id]
  if not s or s.src ~= src or type(data) ~= 'string' then return end
  index = tonumber(index)
  if not index or index < 1 or index > s.total or s.parts[index] then return end
  s.parts[index] = data
  s.got = s.got + 1
  if s.got == s.total then finish(id) end
end)

function Shots.list()
  local rows = Db.shots(150)
  for _, r in ipairs(rows) do r.path = fs:fsAbs(r.file) end
  return rows
end

function Shots.delete(id)
  local row = Db.shot(id)
  if not row then return false end
  fs:fsDelete(row.file)
  Db.deleteShot(id)
  return true
end

-- Retrieves thumbnail data URI for a shot record.
function Shots.thumbFor(id)
  local row = Db.shot(id)
  return row and row.thumb or nil
end

CreateThread(function()
  while true do
    Wait(30000)
    local now = os.time()
    for id, s in pairs(Shots.incoming) do
      if now - s.at > 300 then Shots.incoming[id] = nil end
    end
  end
end)
