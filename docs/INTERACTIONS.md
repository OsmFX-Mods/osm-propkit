# Interactions

An interaction is one option in the player's target menu (osm-target, ox_target or qb-target), plus the pipeline of
steps that runs when they pick it. Interactions live on a **model** (every copy gets them) or on a single
**placement**. Edit them in Hub → a model or placement → Interactions, or write them in a pack.

## Shape

```json
{
  "id": "inflate",
  "label": "Inflate tyre",
  "icon": "fas fa-wind",
  "iconColor": "#7dd3fc",
  "description": "Hold to fill to 32 psi",
  "distance": 2.0,
  "point": { "x": 0.12, "y": -0.05, "z": 0.62 },
  "radius": 0.3,
  "gates": { "groups": { "mechanic": 0 }, "items": { "tyre_valve": 1 }, "cooldown": 30, "cooldownScope": "player" },
  "steps": [
    { "type": "progress", "duration": 4000, "label": "Inflating", "anim": { "dict": "mini@repair", "clip": "fixing_a_ped", "flag": 1 } },
    { "type": "clientEvent", "name": "osm_svcbay:inflate", "args": { "psi": 32 } }
  ],
  "enabled": true
}
```

| Key | Default | Notes |
|---|---|---|
| `id` | from the label | Stable key. Packs match updates by it, events receive it |
| `label` | required | |
| `icon` | `fas fa-hand` | Font Awesome class, what the target scripts render |
| `iconColor` | none | osm-target and ox_target |
| `description` | none | osm-target shows it under the label |
| `distance` | `2.0` | Metres the player may stand from the prop (or point) |
| `point` | none | Metres from the model origin, in the prop's own axes. The option only shows when aiming at this spot. Pick it in the editor (Interactions → A point on it → Pick on the prop) |
| `radius` | `0.35` | How close to `point` the aim must land |
| `bones` | none | Entity bone names, passed through to the target script |
| `gates` | `{}` | Who may use it, see below |
| `steps` | `[]` | What happens, in order |
| `enabled` | `true` | |

**Target scripts.** osm-target and ox_target receive per-option offsets (`offset` + `absoluteOffset` + `offsetSize`),
so several points on one prop work exactly. qb-target has no per-option offsets: PropKit registers a small sphere zone
at each point instead.

## Gates

```json
"gates": {
  "groups": { "police": 0, "mechanic": 2 },
  "items": { "lockpick": 1, "screwdriver": 1 },
  "anyItem": false,
  "cooldown": 300,
  "cooldownScope": "player",
  "state": { "open": true },
  "hours": [8, 20],
  "onFoot": true,
  "hideIneligible": false
}
```

| Key | Meaning |
|---|---|
| `groups` | Any one job/gang/group at the minimum grade. qbx groups, qb job + gang, esx job |
| `items` | Required counts. All of them, or any one with `anyItem: true`. Only checked, not taken (use a Take item step) |
| `cooldown` | Seconds. `cooldownScope`: `player` (each player), `placement` (this prop, everyone), `global` (every copy, everyone) |
| `state` | The placement's live state must match (see Set state). Missing keys count as `false` |
| `hours` | In-game hours, `[from, until)`, wraps past midnight |
| `onFoot` | Not from inside a vehicle |
| `hideIneligible` | Hide the option instead of showing it and explaining why it fails |

The client uses gates to show or hide options; **the server checks them again** before anything runs.

## Steps

Client steps run on the player's machine. Server steps run on the server, in order, and only after enough time has
passed for the progress bars before them (85% of their duration, `Config.Interact.progressSlack`). The server also
re-checks distance before every server step. A modified client cannot skip a progress bar or invent a reward.

| Type | Side | Fields |
|---|---|---|
| `progress` | client | `duration` ms, `label`, `anim` (`dict`/`clip`/`flag` or `scenario`), `prop` (`model`, `bone`, `pos`, `rot`), `canCancel`, `freeze` |
| `anim` | client | `anim`, `duration` (0 = leave it running) |
| `wait` | client | `duration` |
| `notify` | client | `text`, `kind` (`info`/`success`/`warning`/`error`) |
| `sound` | client | `name`, `set` (frontend sound) |
| `ptfx` | client | `asset`, `name`, `scale`, `duration`. Plays at the point, or the prop origin |
| `clientEvent` | client | `name`, `args` |
| `serverEvent` | `via: "net"` client / `via: "internal"` server | `name`, `args` |
| `command` | client | `command` (no slash). Off with `Config.Interact.allowCommands = false` |
| `export` | `side` | `resource`, `fn`, `side` (`client`/`server`), `args` |
| `giveItem` | server | `item`, `count`, `metadata` |
| `removeItem` | server | `item`, `count`. Fails the run if the player has too few |
| `giveMoney` | server | `account`, `amount`. Accounts limited to `Config.Interact.moneyAccounts` |
| `removeMoney` | server | `account`, `amount`. Fails if they cannot pay |
| `setState` | server | `key`, `value` or `toggle: true`, `persist` |
| `swapModel` | server | `model`, `persist`. Running it again swaps back |
| `pickup` | server | `respawn` seconds (0 = until restart), optional `item` + `count` to hand over |

The run stops at the first step that fails (a cancelled progress bar, missing item, not enough money).

## What your scripts receive

Client events, net server events and exports get one table:

```lua
{
  placement = 'pk_a1b2c3d4e5',   -- nil for map copies (worldTargets)
  model = 'osm_tyre_inflator',
  interaction = 'inflate',
  label = 'Inflate tyre',
  entity = 12345,                -- client side only
  coords = vector3(...),         -- the point, or the prop origin
  args = { psi = 32 },           -- the step's args
}
```

```lua
-- client
AddEventHandler('osm_svcbay:inflate', function(data) print(data.placement, data.args.psi) end)

-- server, via = 'net': sent by the player like any target option. Validate here
RegisterNetEvent('myres:server:use', function(data) local src = source end)

-- server, via = 'internal': fired by PropKit after its own checks. Not a net event
AddEventHandler('myres:server:checked', function(src, data) end)

-- export, side = 'server'
exports('Use', function(src, data) return true end)   -- return false to fail the run
```

## Live state

`setState` keeps per-placement state on the server and syncs it to everyone. Combine it with `gates.state` for props
with two sides: "Open" requires `open = false` and sets it true, "Close" requires `open = true` and sets it false.
Add `swapModel` to show the open variant. Other scripts can set it too:
`exports['osm-propkit']:SetPlacementState(id, 'open', true, persist)`.

## Testing

On a placement's Interactions tab, ▶ runs an interaction for real on the nearest copy without aiming at it.
