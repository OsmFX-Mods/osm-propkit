Util = {}
Util.RESOURCE = GetCurrentResourceName()
Util.EVENT = 'osm-propkit:'

-- Rounds number to a specified decimal precision.
function Util.round(v, places)
  local m = 10 ^ (places or 0)
  return math.floor(v * m + 0.5) / m
end

function Util.clamp(v, a, b)
  if v < a then return a elseif v > b then return b end
  return v
end

-- Normalizes vector coordinates into standard table format.
function Util.vec(t, fallback)
  if type(t) == 'vector3' or type(t) == 'vector4' then return { x = t.x + 0.0, y = t.y + 0.0, z = t.z + 0.0 } end
  if type(t) ~= 'table' then return fallback end
  local x, y, z = tonumber(t.x or t[1]), tonumber(t.y or t[2]), tonumber(t.z or t[3])
  if not (x and y and z) then return fallback end
  if x ~= x or y ~= y or z ~= z then return fallback end
  return { x = x + 0.0, y = y + 0.0, z = z + 0.0 }
end

function Util.pos(t) local v = Util.vec(t) return v and { x = Util.round(v.x, 4), y = Util.round(v.y, 4), z = Util.round(v.z, 4) } end
function Util.rot(t) local v = Util.vec(t) return v and { x = Util.round(v.x, 3), y = Util.round(v.y, 3), z = Util.round(v.z, 3) } end

function Util.v3(t) return vector3(t.x + 0.0, t.y + 0.0, t.z + 0.0) end

function Util.dist(a, b)
  local dx, dy, dz = a.x - b.x, a.y - b.y, a.z - b.z
  return math.sqrt(dx * dx + dy * dy + dz * dz)
end

function Util.copy(t, seen)
  if type(t) ~= 'table' then return t end
  seen = seen or {}
  if seen[t] then return seen[t] end
  local out = {}
  seen[t] = out
  for k, v in pairs(t) do out[Util.copy(k, seen)] = Util.copy(v, seen) end
  return out
end

-- Generates a random prefixed identifier string.
local ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz'
function Util.id(prefix)
  local s = {}
  for i = 1, 10 do
    local n = math.random(1, #ALPHA)
    s[i] = ALPHA:sub(n, n)
  end
  return (prefix or 'pk') .. '_' .. table.concat(s)
end

-- Sanitizes string into a lowercase slug key.
function Util.slug(s)
  s = tostring(s or ''):lower():gsub('[^%w_%-%.]+', '_'):gsub('_+', '_'):gsub('^_', ''):gsub('_$', '')
  return s ~= '' and s or 'item'
end

-- Formats table into deterministic, canonically sorted JSON for hashing.
local function canon(v)
  local t = type(v)
  if t == 'table' then
    local n = #v
    local isArr = n > 0
    if isArr then
      for k in pairs(v) do if type(k) ~= 'number' or k > n or k < 1 or k % 1 ~= 0 then isArr = false break end end
    end
    if isArr then
      local parts = {}
      for i = 1, n do parts[i] = canon(v[i]) end
      return '[' .. table.concat(parts, ',') .. ']'
    end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = tostring(k) end
    if #keys == 0 then return '{}' end
    table.sort(keys)
    local parts = {}
    for i = 1, #keys do
      local k = keys[i]
      local val = v[k]
      if val == nil then val = v[tonumber(k)] end
      parts[i] = string.format('%q', k) .. ':' .. canon(val)
    end
    return '{' .. table.concat(parts, ',') .. '}'
  elseif t == 'number' then
    if v % 1 == 0 and math.abs(v) < 1e15 then return string.format('%d', v) end
    return string.format('%.6f', v)
  elseif t == 'string' then
    return string.format('%q', v)
  elseif t == 'boolean' then
    return v and 'true' or 'false'
  end
  return 'null'
end
Util.canon = canon

-- Computes 32-bit FNV-1a checksum hash of canonical serialized data.
function Util.hash(v)
  local s = type(v) == 'string' and v or canon(v)
  local h = 2166136261
  for i = 1, #s do
    h = h ~ s:byte(i)
    h = (h * 16777619) & 0xffffffff
  end
  return string.format('%08x', h)
end

function Util.count(t)
  local n = 0
  for _ in pairs(t or {}) do n = n + 1 end
  return n
end

function Util.decode(s, fallback)
  if type(s) == 'table' then return s end
  if type(s) ~= 'string' or s == '' then return fallback end
  local ok, v = pcall(json.decode, s)
  if ok and v ~= nil then return v end
  return fallback
end

function Util.encode(v)
  return json.encode(v, { sort_keys = true })
end

function Util.truthy(v) return v == true or v == 1 or v == '1' or v == 'true' end

function Util.log(...)
  if Config.Debug then print('^5[propkit]^7', ...) end
end
