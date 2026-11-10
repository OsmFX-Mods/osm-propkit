Config = {}

-- Framework auto-detection or explicit selection: 'qbx', 'qb', 'esx', 'ox', 'standalone'.
Config.Framework = 'auto'

-- Inventory integration: 'auto', 'ox', or 'framework'.
Config.Inventory = 'auto'

-- Target system integration: 'auto', 'osm', 'ox', or 'qb'.
Config.Target = 'auto'

-- Automatically imports packs discovered in started resources.
Config.AutoInstall = true

-- Chat command to open the PropKit management hub.
Config.Command = 'propkit'

-- Chat command to open the photo studio directly.
Config.StudioCommand = 'propstudio'

-- Role and ACE permissions required for administrative tools.
Config.Permissions = {
  edit = { ace = 'osm-propkit.edit', groups = { 'admin', 'god' } },
  studio = { ace = 'osm-propkit.studio', groups = { 'admin', 'god' } },
  packs = { ace = 'osm-propkit.packs', groups = { 'god', 'admin' } },
}

-- Client-side spatial streaming thresholds and batch limits.
Config.Stream = {
  defaultDistance = 120.0,
  hysteresis = 15.0,
  tick = 600,
  perFrame = 6,
  modelTimeout = 8000,
  defaultLod = 300,
}

-- Default settings applied to newly created model profiles.
Config.ModelDefaults = {
  mode = 'local',
  collision = true,
  freeze = true,
  distance = 120.0,
  invincible = true,
  category = 'Uncategorised',
}

-- Placement editor, camera speed, and snapping presets.
Config.Editor = {
  reach = 250.0,
  flySpeed = 4.0,
  flySpeedRange = { 0.25, 40.0 },
  snapMove = { 0.01, 0.05, 0.1, 0.25, 0.5, 1.0 },
  snapTurn = { 1, 5, 15, 45, 90 },
  outline = { 255, 138, 61, 255 },
  surfaceOffset = 0.0,
  frameRate = 60,
}

-- Interaction pipeline execution rules and distance tolerances.
Config.Interact = {
  defaultDistance = 2.0,
  distanceSlack = 3.0,
  progressSlack = 0.85,
  maxSteps = 24,
  progress = 'bar',
  allowCommands = true,
  allowExports = true,
  moneyAccounts = { 'cash', 'bank' },
  logRuns = false,
}

-- Studio capture configuration, storage directories, and rendering limits.
Config.Studio = {
  shotsFolder = 'shots',
  exportsFolder = 'exports',
  thumbSize = 360,
  maxUpload = 40,
  -- Remote image upload integration: 'none', 'discord', 'fivemanage', or 'custom'.
  upload = {
    type = 'none',
    url = '',
    token = '',
    field = 'file',
  },
  parkPed = true,
  -- Level of detail scale multiplier and upper cap.
  lodScale = 1.0,
  maxLodScale = 1.25,
  -- Diagnostic toggles to disable specific studio subsystems.
  disable = { lod = false, lights = false, backdrop = false, parkPed = false, clock = false, weather = false, focus = false },
  hideHud = true,
}

Config.Debug = false
