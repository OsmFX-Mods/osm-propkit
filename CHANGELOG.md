# Changelog

All notable changes to **PropKit** (`osm-propkit`) are documented here.

## [1.0.0] - 2026-11-10

### Added
- **Visual World Editor**:
  - Freecam with Unreal-style controls (right-click fly, middle-click orbit, shift-pan, scroll zoom).
  - True 3D ray-cast transform gizmo with translation axes, plane squares, rotation rings, and surface-snap ground alignment.
  - Millimeter-precision database storage using `DOUBLE` fields for coordinates.
  - Sequential multi-placement workflow (`Shift + Enter`).
  - Per-placement collision, freeze, LOD range, alpha, and draw distance toggles.
- **Interaction Engine**:
  - Full compatibility with `osm-target`, `ox_target`, and `qb-target`.
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
- **Bridges & Infrastructure**:
  - Framework auto-detection: Qbox, QBCore, ESX, ox_core, and standalone.
  - Complete localization via `config/locale.lua` for client, server, and web NUI.
  - Offline-ready bundled web assets with local fonts.

