-- Shared requirement validation for jobs, items, state variables, operational hours, and vehicle status.
Gates = {}

-- Evaluates requirement conditions against player context.
function Gates.check(g, ctx)
  if not g then return true end
  if g.groups then
    local ok = false
    for name, min in pairs(g.groups) do
      local have = ctx.groups[name]
      if have and have >= (min or 0) then ok = true break end
    end
    if not ok then return false, 'group' end
  end
  if g.items then
    local any, all = false, true
    for item, n in pairs(g.items) do
      if ctx.count(item) >= n then any = true else all = false end
    end
    if g.anyItem then
      if not any then return false, 'item' end
    elseif not all then
      return false, 'item'
    end
  end
  if g.state then
    for k, v in pairs(g.state) do
      local cur = ctx.state and ctx.state[k]
      if cur == nil and v == false then cur = false end
      if cur ~= v then return false, 'state' end
    end
  end
  if g.hours and ctx.hour then
    local a, b = g.hours[1], g.hours[2]
    local h = ctx.hour
    local inside = a <= b and (h >= a and h < b) or (a > b and (h >= a or h < b))
    if not inside then return false, 'hours' end
  end
  if g.onFoot and ctx.inVehicle then return false, 'vehicle' end
  return true
end

-- Identifies first missing item requirement and quantity.
function Gates.missingItem(g, ctx)
  for item, n in pairs(g and g.items or {}) do
    if ctx.count(item) < n then return item, n end
  end
end
