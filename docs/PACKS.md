# Packs

A pack is one JSON file that carries everything PropKit knows about one or more props: their profile (label,
category, spawn settings), their interactions, default locations, and studio scenes. You ship it with a prop;
the customer installs it, then edits whatever they like. When you release a new version of the prop, they install
the new pack and PropKit merges it without losing their edits.

This page is the full reference. It is written so a developer or an AI agent can write a pack by hand, without
opening the game. Validate against [`schema/pack.schema.json`](../schema/pack.schema.json).

---

## 1. Where packs come from

PropKit looks in three places. All three end in the same review screen (Hub → Packs).

| Source | How | Installs |
|---|---|---|
| Another resource | Add `osm_propkit_pack 'propkit/pack.json'` to that resource's `fxmanifest.lua` (the line may appear several times) | Automatically the first time that resource runs (merge), when `Config.AutoInstall = true`. Updates show as "Update" in the Packs tab |
| This resource's `packs/` folder | Drop `my_pack.json` in `osm-propkit/packs/` | From the Packs tab, or `propkit_install my_pack.json` in the server console |
| Pasted JSON | Hub → Packs → Import JSON | From the review screen |

**Recommended for OsmFX props:** put the pack inside the prop resource (`osm_tyre_rack/propkit/pack.json`) and add
the `osm_propkit_pack` line. Customers ensure the prop and it just works.

```lua
-- fxmanifest.lua of the prop resource
fx_version 'cerulean'
game 'gta5'
this_is_a_map 'yes'
osm_propkit_pack 'propkit/pack.json'
files { 'propkit/pack.json' }   -- not required for server reads, harmless
```

A resource can also install its pack from code: `exports['osm-propkit']:InstallPack(GetCurrentResourceName(), 'propkit/pack.json', 'merge')`.

---

## 2. File shape

```json
{
  "format": "osm-propkit/pack@1",
  "id": "osmfx_workshop",
  "name": "OsmFX Workshop",
  "version": "1.1.0",
  "author": "OsmFX",
  "description": "Tyre inflator, tool chest and lift with Legion garage locations.",
  "url": "https://osmfx.tebex.io",
  "models": [ ... ],
  "placements": [ ... ],
  "scenes": [ ... ]
}
```

| Key | Required | Notes |
|---|---|---|
| `format` | no (recommended) | Always `osm-propkit/pack@1`. Anything else is rejected |
| `id` | **yes** | Stable forever. Lowercase, `a-z 0-9 _ - .`. The id is how PropKit knows a later file is an update of the same pack |
| `name`, `version`, `author`, `description`, `url` | no | `version` is compared numerically (`1.10.0` > `1.9.2`) to show "Update" |
| `models` | no | Profiles and interactions, matched by `model` name |
| `placements` | no | Default locations, matched by `key` |
| `scenes` | no | Studio scenes, matched by `key` |

Every list is optional. A pack with only `models[].interactions` is valid and only adds interactions.

---

## 3. Models

```json
{
  "model": "osm_tyre_inflator",
  "label": "Tyre Inflator",
  "category": "Workshop",
  "description": "Wall-mounted inflator with a coiled hose.",
  "tags": ["mechanic", "garage"],
  "spawn": { "mode": "local", "collision": true, "freeze": true, "distance": 120, "lod": 300, "invincible": true },
  "worldTargets": false,
  "interactions": [ ... ]
}
```

| Key | Default | Notes |
|---|---|---|
| `model` | required | The spawn name (streamed `.ydr` name or base-game prop) |
| `label` | the model name | Shown everywhere in the hub |
| `category` | `Uncategorised` | Library filter |
| `spawn.mode` | `local` | `local`: each player spawns their own copy (no entity limit, best for static props). `networked`: one server entity shared by everyone (OneSync), for props that must be the same object |
| `spawn.collision` | `true` | |
| `spawn.freeze` | `true` | Frozen props never move or fall. Keep it on for anything placed precisely |
| `spawn.distance` | `120` | Metres. Spawns inside, despawns at distance + `Config.Stream.hysteresis` |
| `spawn.lod` | `300` | Entity LOD distance in metres |
| `spawn.invincible` | `true` | Ignores damage, frag props do not break |
| `worldTargets` | `false` | Also put this model's interactions on copies the **map** places (every ATM, every vending machine). Placements always get them |
| `interactions` | `[]` | See [INTERACTIONS.md](INTERACTIONS.md) |

**Patch semantics.** When a pack updates a model that already exists, only the keys present in the file are written.
A file that says `{ "model": "x", "interactions": [...] }` never resets the customer's spawn settings.

---

## 4. Placements

```json
{
  "key": "legion_bay1",
  "model": "osm_tyre_inflator",
  "label": "Bay 1 inflator",
  "group": "Legion garage",
  "pos": { "x": 154.2087, "y": -1023.4410, "z": 29.3741 },
  "rot": { "x": 0.0, "y": 0.0, "z": 160.0 },
  "mode": "local",
  "distance": 150,
  "inherit": true,
  "interactions": []
}
```

| Key | Notes |
|---|---|
| `key` | **Stable id inside the pack.** Updates and conflict detection match on `(pack id, key)`. Never reuse a key for a different spot |
| `pos` | World coordinates. Keep 4 decimals; PropKit stores `DOUBLE` and restores them exactly. Arrays `[x, y, z]` also work |
| `rot` | Degrees, GTA rotation order 2: `x` pitch, `y` roll, `z` yaw (heading). `heading: 160` alone is accepted too |
| `mode`, `distance`, `lod`, `collision`, `freeze`, `alpha` | Overrides. Leave out to use the model profile |
| `inherit` | `true` (default): the model's interactions apply too. `false`: only this placement's own |
| `interactions` | Interactions only on this copy. Same id as a model interaction replaces it here |
| `enabled` | `false` keeps it in the database, nobody sees it |
| `bucket` | Routing bucket (networked mode only) |
| `anchor` | Sit relative to a map object, see below |
| `interior` | `{ "hash": nameHash, "room": roomKey }`, written by the editor. Forces the MLO room so the prop renders inside |
| `meta` | Free JSON for your own scripts (`exports['osm-propkit']:GetPlacement(id).meta`) |

**Precision.** Props are spawned at the stored coordinates and frozen. They are never dropped to the ground at spawn
time, so a placement 6 km away is exact even when its ground is not loaded yet. "Drop to ground" only runs in the
editor, while the area is loaded, and its result is saved as plain numbers.

**Anchors.** A prop that belongs on something the map already has (a shelf, a counter):
```json
"anchor": {
  "model": "v_ret_ml_fridge",
  "pos": { "x": 25.71, "y": -1347.32, "z": 28.49 },
  "rot": { "x": 0, "y": 0, "z": 90 },
  "offset": { "x": 0.0, "y": -0.12, "z": 1.82 },
  "local_rot": { "x": 0, "y": 0, "z": 0 },
  "radius": 1.5
}
```
Each client finds the closest `model` within `radius` of `pos` and places the prop at `offset` / `local_rot` in that
object's space. If it is not found, the placement's own `pos`/`rot` are used (always written alongside). The editor's
Anchor tool fills all of this for you.

---

## 5. Scenes

Studio setups. They are written by the studio (Hub → Studio → save) and exported with packs; you rarely write them by
hand. Positions are relative to the stage origin, so a scene loads wherever the customer opens the studio.

```json
{ "key": "hero", "name": "Inflator hero shot", "model": "osm_tyre_inflator", "data": { ...studio scene... } }
```

---

## 6. Installing: the review

Every install shows each item as one of:

| Status | Meaning |
|---|---|
| **New** | Not on this server yet |
| **Update** | On this server from this pack, unchanged locally, and the pack has a different version of it |
| **Edited here** | The server owner changed it after installing (or created it by hand). This is a conflict |
| **Not in pack** | Installed from this pack before, missing from this file |
| **Same** | Nothing to do |

Per section (profiles, interactions, placements, scenes) you choose a strategy:

| Strategy | New | Update | Edited here | Not in pack |
|---|---|---|---|---|
| **Merge** (default) | add | apply | keep theirs | keep |
| **Overwrite** | add | apply | take the pack's | keep |
| **Add new** | add | keep | keep | keep |
| **Replace** | add | apply | take the pack's | delete |
| **Skip** | - | - | - | - |

How "edited here" is known: every installed item stores a hash of the pack's copy. Profiles, placements and scenes
compare the whole item; interactions carry their own `origin` hash, so editing one interaction never marks the
whole model as edited.

Console (txAdmin live console, no game needed):
```
propkit_install my_pack.json merge
propkit_install osm_svcbay overwrite
propkit_export osmfx_workshop
propkit_export my_snapshot all
```

---

## 7. Exporting

Hub → Packs → Export (or a model's ⋯ → Export as pack). Pick models, choose whether to include profiles, interactions,
scenes, and default locations (none, every placement of those models, or only those near you). The file is written to
`osm-propkit/exports/<id>-<version>.json` and can be copied from the result screen.

Exported files are cleaned: runtime state, origin hashes, thumbnails and ids are dropped; keys are kept so the next
export of the same pack updates cleanly.

---

## 8. Checklist for a new prop (developers and AI agents)

1. Pick a pack `id` (`osmfx_<product>`) and never change it.
2. For each model: `model`, `label`, `category`, `spawn` (keep `freeze: true` unless it must move).
3. Interactions: give each a short stable `id` (`inflate`, `open`, `buy_coffee`). Use `point` (metres from the
   model origin) for spots on the prop. Put rewards and costs in steps, never trust a client event for them.
4. Default placements (optional): a stable `key` each, `pos` to 4 decimals, `rot.z` heading, a `group`.
5. Validate the file against `schema/pack.schema.json`.
6. Ship it inside the prop resource with `osm_propkit_pack 'propkit/pack.json'`.
7. Bump `version` for every release. Keep keys and ids stable so customers' edits survive.
