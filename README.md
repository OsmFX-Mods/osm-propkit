# OsmFX PropKit

[![FiveM Ready](https://img.shields.io/badge/FiveM-Ready-orange?style=for-the-badge&logo=fivem&logoColor=white)](https://fivem.net/)
[![Release v1.0.0](https://img.shields.io/badge/Release-v1.0.0-blue?style=for-the-badge)](changelogs/CHANGELOG-1-0-0.md)
[![Framework](https://img.shields.io/badge/Framework-Qbox%20%7C%20QBCore%20%7C%20ESX%20%7C%20Standalone-informational?style=for-the-badge)](https://github.com/orgs/OsmFX-Mods/repositories)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://osmfxmods.com/discord)
[![Store](https://img.shields.io/badge/Store-osmfxmods.com-brightgreen?style=for-the-badge)](https://osmfxmods.com)

**Place, persist, wire, and photograph any prop in FiveM.**

PropKit is an end-to-end prop utility designed for server owners, prop creators, and map builders. It replaces manual vector coordinate copying and boilerplate Lua scripts with an interactive in-engine 3D transform gizmo, a visual multi-step interaction pipeline, an in-game cinematic photo studio with transparent cutouts, and a portable JSON pack system.

- **Store:** [osmfxmods.com](https://osmfxmods.com)
- **Discord Community:** [osmfxmods.com/discord](https://osmfxmods.com/discord)

---

## Highlights

### Visual 3D World Editor & Precision Gizmo
- **Live Transform Gizmo**: Move along axes, drag across planes, rotate with Euler rings, or drag freely across surfaces directly under the cursor.
- **Unreal-Style Viewport Controls**: Smooth right-click fly camera with WASD/QE, middle-click orbit, shift-pan, and scroll zoom.
- **Physics-Aware Grounding**: Drop props down to terrain or flooring using rotated bounding box math with optional slope/surface tilt alignment.
- **Millimeter Precision**: Coordinates and rotations are stored as `DOUBLE` precision floats in MySQL, preventing coordinate degradation.
- **Map & MLO Anchoring**: Anchor dynamic props to existing static map entities or tag them to interior rooms for seamless MLO rendering.
- **Rapid Multi-Placement**: Press `Shift + Enter` to commit a placement and immediately place the next instance.

### Visual Interaction Engine & Pipeline Builder
- **Target Agnostic**: Native integration with `osm-target`, `ox_target`, and `qb-target`, with built-in key prompt fallbacks.
- **17 Modular Pipeline Steps**: Chain animations, progress bars, timed waits, item costs/rewards, cash/bank transactions, client/server events, state switches, model swaps, and audio feedback.
- **Pinpoint Surface Targeting**: Click directly on prop geometry to anchor 3D interaction points with configurable radiuses instead of relying on bounding centers.
- **Access Control Gates**: Restrict options by framework jobs, gang ranks, citizen IDs, required inventory items, distance limits, entity state flags, or player/shared cooldown timers.
- **Dynamic State Machines**: Read, toggle, and persist entity state flags (`open`, `locked`, `broken`) that dynamically modify visible target options in real time.
- **Archetype Inheritance**: Define interactions globally on model archetypes and selectively override or extend them on individual placements.

### Cinematic Photo & Video Studio
- **Dedicated Production Set**: Spawn an isolated void cyclorama stage or frame shots directly in the live world via `/propstudio [model]`.
- **Zero-Dependency Captures**: Direct CEF game-view texture buffer hook captures pristine high-res frames without external screenshot resources.
- **Instant Transparent Alpha**: Generate clean cutouts using two-pass difference matting (black & white backdrops) or edge-aware chroma keying with spill suppression.
- **Lighting & FX Suite**: Place studio spot and point lights with Kelvin color temperatures, adjustable falloffs, softness, and real-time shadows, accompanied by particle effects and peds.
- **Automated Batch Photography**: Fire off 360° turntable rotations or multi-angle batches with a single click.
- **Keyframed Camera Tracks**: Choreograph smooth multi-point camera paths and record WebM video clips.
- **Instant Webhooks & Clipboard**: Upload directly to Discord via configurable webhooks or copy rendered images straight to your clipboard.

### Pack Architecture & Auto-Discovery
- **Portable JSON Packs**: Models, spawn parameters, interaction pipelines, and studio scenes bundled in lightweight `.json` files.
- **Resource Auto-Discovery**: Any running resource can register packs simply by adding `osm_propkit_pack 'my_pack.json'` to its `fxmanifest.lua`.
- **Visual Diff & Merge Inspector**: Review incoming packs against your local database with 3-way conflict resolution (`merge`, `overwrite`, `add`, `replace`, `skip`).

---

## Requirements

| Requirement | Details |
|---|---|
| **OneSync** | Required for server entity state and networked placement modes. |
| [ox_lib](https://github.com/overextended/ox_lib) | Required. Callbacks, cache, and input helpers. |
| [oxmysql](https://github.com/overextended/oxmysql) | Required. Database persistence for placements, models, scenes, and packs. |
| **Node.js 22 Runtime** | Built-in to modern FXServer artifacts (configured via `node_version '22'` in manifest). |
| **Framework (Optional)** | `qbx_core`, `qb-core`, `es_extended`, `ox_core`, or Standalone. |
| **Inventory (Optional)** | `ox_inventory`, `qb-inventory`, or ESX inventory. |
| **Target (Optional)** | `osm-target`, `ox_target`, or `qb-target`. |

---

## Installation

1. Download or clone `osm-propkit` into your server's `resources` directory.
2. Ensure `osm-propkit` starts **after** its dependencies in your `server.cfg`:
   ```cfg
   ensure ox_lib
   ensure oxmysql
   ensure qbx_core         # Or qb-core / es_extended / ox_core
   ensure ox_target        # Or osm-target / qb-target
   ensure osm-propkit
   ```
3. **Database Setup**: PropKit automatically creates all required tables (`osm_propkit_*`) on startup. (Manual schemas are provided in `sql/install.sql` if preferred).
4. **Permissions**: Grant administrative permissions using either ACE or framework groups:
   - **ACE Permissions**:
     ```cfg
     add_ace group.admin osm-propkit.edit allow
     add_ace group.admin osm-propkit.studio allow
     add_ace group.admin osm-propkit.packs allow
     add_principal identifier.fivem:YOUR_IDENTIFIER group.admin
     ```
   - **Framework Groups**: Configure authorized groups in [`config/config.lua`](config/config.lua) under `Config.Permissions`.

---

## Controls & Shortcuts

### Viewport Navigation (Editor & Studio)
- **Hold Right Mouse + WASD**: Fly through the scene.
- **Q / E**: Fly downward / upward.
- **Shift / Ctrl**: Fly faster / slower.
- **Mouse Wheel**: Adjust fly speed (or zoom camera when not flying).
- **Hold Middle Mouse (or Alt + Left Mouse)**: Orbit around the selected prop or target.
- **Shift + Middle Mouse**: Pan viewport laterally.
- **F**: Frame selection.
- **H**: Toggle UI overlay visibility.

### 3D Transform Gizmo
- **W / E**: Switch between Translation (Move) and Rotation modes.
- **Q**: Toggle between World and Local coordinate spaces.
- **X**: Toggle grid/angle snapping. Hold **Ctrl** during drag to temporarily invert snap behavior.
- **Hold Shift**: Fine-precision drag mode (1/10th speed).
- **S**: Surface Raycast Tool (click any in-game surface to rest the prop on it).
- **G**: Drop to Ground (lowest bounding box corner touches terrain, with slope tilt toggle).
- **A**: Anchor Tool (click an existing world object to bind relative offset).
- **Ctrl + Z / Ctrl + Y**: Multi-step Undo / Redo.
- **Enter**: Save placement.
- **Shift + Enter**: Save placement and immediately place another copy.
- **Escape**: Cancel or close editor.

---

## Commands

| Command | Permission | Description |
|---|---|---|
| `/propkit` | `edit` | Opens the main PropKit Hub (Library, Placed props, Packs, Settings). |
| `/propstudio [model]` | `studio` | Opens the cinematic Photo Studio (optionally targeting a specific model). |
| `propkit_install <file\|res> [strategy]` | Server Console | Headlessly installs a pack file from disk or an external resource. |
| `propkit_export <packId> [all]` | Server Console | Exports database pack contents to the server's `exports/` folder. |
| `/propkit_rottest` | Public | Diagnostic utility verifying Euler rotation conversions against FiveM native matrices. |
| `/propkit_lighttest` | `studio` | Diagnostic tool verifying studio lighting projection and intensity ranges. |

---

## Server Exports API

Integrate PropKit directly into your custom scripts and server systems:

```lua
-- Install a pack definition from another resource
local success, counts = exports['osm-propkit']:InstallPack('my_resource', 'packs/starter.json', 'merge')

-- Retrieve a placement record by ID
local placement = exports['osm-propkit']:GetPlacement('pk_abc123')

-- Get all placements (optionally filtered by prop model)
local allChairs = exports['osm-propkit']:GetPlacements('prop_chair_01a')

-- Save or update a placement definition programmatically
local placementId = exports['osm-propkit']:SavePlacement({
    model = 'prop_toolchest_05',
    pos = vector3(100.5, -200.25, 30.1),
    rot = vector3(0.0, 0.0, 90.0),
    group = 'Mechanic Shop',
    enabled = true,
})

-- Update dynamic state flags (e.g. triggerable by external jobs or minigames)
exports['osm-propkit']:SetPlacementState('pk_abc123', 'isLocked', false, true)

-- Toggle placement visibility/streaming
exports['osm-propkit']:SetPlacementHidden('pk_abc123', true)

-- Remove a placement from world and database
exports['osm-propkit']:RemovePlacement('pk_abc123')
```

---

## Documentation & Guides

Comprehensive guides are available in the [`docs/`](docs) folder:

- **[Placing Props & Gizmo Guide](docs/EDITOR.md)**: Deep dive into 3D navigation, raycast alignment, surface anchoring, and MLO room tagging.
- **[Interaction Pipeline Manual](docs/INTERACTIONS.md)**: Full breakdown of all 17 step types, gate conditions, state machines, and sound sets.
- **[Photo & Video Studio Manual](docs/STUDIO.md)**: Master studio backdrops, lighting temperature, matte extraction, camera tracks, and Discord webhooks.
- **[Packs & Authoring Guide](docs/PACKS.md)**: Instructions for prop artists on bundling JSON packs with models.
- **[JSON Schema Reference](schema/pack.schema.json)**: Formal JSON validation schema for PropKit pack definitions.
- **[Starter Pack Example](packs/example_osmfx_starter.json)**: Ready-to-use sample pack featuring vanilla props and interactive setups.

---

## Configuration

PropKit is designed to be easily customized. Configuration files and framework bridges live in clean, dedicated files:

- [`config/config.lua`](config/config.lua): Core settings, permissions, streaming radius, LOD distances, snapping increments, and studio paths.
- [`config/catalog.lua`](config/catalog.lua): Curated quick-pick lists for animations, scenarios, peds, particle effects, weather, visual color grades, sounds, and target icons.
- [`config/locale.lua`](config/locale.lua): Complete localization dictionary covering all client, server, and web NUI UI strings.
- [`bridge/`](bridge): Framework, inventory, and target integration adapters.

---

## Building the UI

The user interface is built with **React 19**, **TypeScript**, and **Vite**, featuring bundled typography for full offline support.

```bash
# Navigate to the frontend directory
cd ui

# Install dependencies
npm install

# Run Vite development server with mock FiveM environment
npm run dev

# Compile production bundle into html/
npm run build
```

---

## Behind The Scenes

> [!NOTE]
> ### Built with Claude & Active Development
>
> This resource was built in pair-programming collaboration with **Claude**. While Claude wrote the code and drank infinite virtual coffee, humans supervised to make sure everything actually ran smoothly in FiveM.
>
> PropKit is in **active development**. If you run into any bugs or have feature ideas, please **open an issue on GitHub**. Claude and our automated tooling periodically pick up open issues, write solutions, and ship fixes.

---

## Support & Community

- **Download:** [osm-propkit.zip](https://github.com/OsmFX-Mods/osm-propkit/releases/latest/download/osm-propkit.zip)
- **Discord Server:** [osmfxmods.com/discord](https://osmfxmods.com/discord)
- **Official Store:** [osmfxmods.com](https://osmfxmods.com)
- **Organization:** [OsmFX Mods](https://github.com/orgs/OsmFX-Mods)
