# Changelog 1.0.0

Initial release of **PropKit** (`osm-propkit`): place, persist, wire interactions, and shoot studio catalog photos for any prop. Ships with zero-friction pack import/export, millimeter-precision placement gizmos, and an in-game photo studio.

- **Discord:** [osmfxmods.com/discord](https://osmfxmods.com/discord)
- **Store:** [osmfxmods.com](https://osmfxmods.com)

## Highlights

- **Visual World Editor & 3D Gizmo**:
  - Freecam with Unreal-style controls (right-click fly, middle-click orbit, shift-pan, scroll zoom).
  - True 3D ray-cast transform gizmo with single-axis translation, planar movement, rotation rings, and surface-snap ground alignment.
  - Millimeter-precision database persistence (`DOUBLE` floating-point coordinates).
  - Rapid multi-placement sequencing (`Shift + Enter`).
  - Configurable collision, freeze, LOD range, alpha, and draw distance toggles per placement.

- **Interaction Engine & Step Pipeline**:
  - Target system support: `osm-target`, `ox_target`, `qb-target`, or standalone prompt fallbacks.
  - Multi-step action pipelines combining animations, progress bars, waits, notifications, sound effects, particles, item checks/rewards, money deductions/deposits, client events, and server events.
  - Gate conditions: job/gang grade checks, citizen IDs, item requirements, distance limits, shared/player cooldowns, and entity state requirements.
  - Point-on-prop targeting: place 3D interaction anchor points directly onto the prop surface.
  - Model archetype inheritance: define interactions globally on model archetypes or override them per placement instance.
  - Dynamic state machines: read and toggle persistent or session entity state (`open`, `locked`, `broken`, etc.) to dynamically change available target options.

- **Cinematic Photo & Catalog Studio**:
  - Dedicated studio stage (`/propstudio`) with an infinite cyclorama or backdrop set, customizable stage origin, and anti-z-fighting floor offset.
  - Direct CEF frame buffer capture via FiveM game-view texture hook without external screenshot resources.
  - Transparent alpha generation: dual-pass clean matte (black/white difference) and edge-aware chroma keying with spill suppression.
  - Studio lights, peds, and atmospheric particle effects with interactive viewport ray-cast placement.
  - Automated turntable rotation and multi-angle batch captures.
  - Video clip recording and camera keyframe animation tracks.
  - Optional Discord webhook upload integration and local image storage in `shots/`.

- **Pack Architecture & Auto-Discovery**:
  - JSON pack schema (`schema/pack.schema.json`) with declarative model definitions, placements, and interaction blueprints.
  - Automatic pack discovery across any running server resource specifying `osm_propkit_pack` in `fxmanifest.lua`.
  - In-game pack manager with interactive visual diff viewer, conflict detection, three-way merge, and export hub.

- **Framework & Target Support**:
  - **Frameworks:** Qbox (`qbx_core`), QBCore (`qb-core`), ESX (`es_extended`), `ox_core`, or standalone.
  - **Inventories:** `ox_inventory`, `qb-inventory`, `es_extended`.
  - **Targets:** `osm-target`, `ox_target`, `qb-target`.
  - **Required:** `ox_lib`, `oxmysql`, OneSync, Node 22 runtime.

- **Localization & Offline Ready**:
  - All script and NUI text managed via `config/locale.lua`, allowing full localization and custom wording without rebuilding UI bundles.
  - Self-contained web assets with bundled Plus Jakarta Sans and JetBrains Mono fonts (100% offline-ready).

