-- Presets catalog for animations, scenarios, peds, particle effects, looks, weather, sounds, and icons.
Catalog = {}

-- Animation dictionaries and clips for interactions and studio peds.
Catalog.anims = {
  { label = 'Repair crouched',   dict = 'mini@repair', clip = 'fixing_a_ped', flag = 1 },
  { label = 'Mechanic hands',    dict = 'anim@amb@clubhouse@tutorial@bkr_tut_ig3@', clip = 'machinic_loop_mechandplayer', flag = 1 },
  { label = 'Search bin',        dict = 'amb@prop_human_bum_bin@idle_b', clip = 'idle_d', flag = 1 },
  { label = 'Pick up low',       dict = 'pickup_object', clip = 'pickup_low', flag = 0 },
  { label = 'Carry box',         dict = 'anim@heists@box_carry@', clip = 'idle', flag = 49 },
  { label = 'Clipboard',         dict = 'amb@world_human_clipboard@male@idle_a', clip = 'idle_c', flag = 49 },
  { label = 'Hand over',         dict = 'mp_common', clip = 'givetake1_a', flag = 0 },
  { label = 'Key fob click',     dict = 'anim@mp_player_intmenu@key_fob@', clip = 'fob_click', flag = 48 },
  { label = 'Welding',           dict = 'amb@world_human_welding@male@base', clip = 'base', flag = 1 },
  { label = 'Hammering',         dict = 'amb@world_human_hammering@male@base', clip = 'base', flag = 1 },
  { label = 'Keypad',            dict = 'anim@heists@keypad@', clip = 'idle_a', flag = 1 },
  { label = 'ATM',               dict = 'amb@prop_human_atm@male@idle_a', clip = 'idle_b', flag = 1 },
  { label = 'Fill can',          dict = 'timetable@gardener@filling_can', clip = 'gar_ig_5_filling_can', flag = 1 },
  { label = 'Body search',       dict = 'anim@gangops@facility@servers@bodysearch@', clip = 'player_search', flag = 1 },
  { label = 'Parking meter',     dict = 'amb@prop_human_parking_meter@male@idle_a', clip = 'idle_a', flag = 1 },
}

-- Full-body ambient scenarios for studio peds.
Catalog.scenarios = {
  'WORLD_HUMAN_CLIPBOARD', 'WORLD_HUMAN_WELDING', 'WORLD_HUMAN_HAMMERING', 'WORLD_HUMAN_VEHICLE_MECHANIC',
  'WORLD_HUMAN_STAND_MOBILE', 'WORLD_HUMAN_SMOKING', 'WORLD_HUMAN_LEANING', 'WORLD_HUMAN_DRINKING',
  'WORLD_HUMAN_AA_COFFEE', 'WORLD_HUMAN_GUARD_STAND', 'WORLD_HUMAN_CONST_DRILL', 'WORLD_HUMAN_MAID_CLEAN',
  'WORLD_HUMAN_HANG_OUT_STREET', 'WORLD_HUMAN_TOURIST_MOBILE', 'WORLD_HUMAN_PAPARAZZI', 'WORLD_HUMAN_CHEERING',
  'WORLD_HUMAN_MUSCLE_FLEX', 'CODE_HUMAN_MEDIC_KNEEL', 'PROP_HUMAN_BUM_BIN', 'PROP_HUMAN_ATM',
  'PROP_HUMAN_SEAT_CHAIR_MP_PLAYER',
}

-- Ambient ped models available in studio mode.
Catalog.peds = {
  { label = 'Mechanic',      model = 's_m_y_xmech_02' },
  { label = 'Autoshop',      model = 's_m_m_autoshop_01' },
  { label = 'Builder',       model = 's_m_y_construct_01' },
  { label = 'Chef',          model = 's_m_y_chef_01' },
  { label = 'Scientist',     model = 's_m_m_scientist_01' },
  { label = 'Shop clerk',    model = 's_f_y_shop_mid' },
  { label = 'Business man',  model = 'a_m_y_business_01' },
  { label = 'Business woman', model = 'a_f_y_business_02' },
  { label = 'Hipster',       model = 'a_m_y_hipster_01' },
  { label = 'Hipster (f)',   model = 'a_f_y_hipster_02' },
  { label = 'Skater',        model = 'a_m_y_skater_01' },
  { label = 'Fitness',       model = 'a_f_y_fitness_01' },
  { label = 'Police',        model = 's_m_y_cop_01' },
  { label = 'Firefighter',   model = 's_m_y_fireman_01' },
  { label = 'Biker',         model = 'g_m_y_lost_01' },
}

-- Particle effect assets and effect names.
Catalog.ptfx = {
  { label = 'Smoke cloud',     asset = 'core', name = 'exp_grd_bzgas_smoke', scale = 0.6 },
  { label = 'Steam burst',     asset = 'core', name = 'ent_sht_steam', scale = 1.0 },
  { label = 'Cigarette smoke', asset = 'core', name = 'ent_anim_cig_smoke', scale = 1.0 },
  { label = 'Generator smoke', asset = 'core', name = 'ent_amb_generator_smoke', scale = 1.0 },
  { label = 'Sparking wires',  asset = 'core', name = 'ent_brk_sparking_wires', scale = 1.0 },
  { label = 'Electric sparks', asset = 'core', name = 'ent_dst_elec_fire_sp', scale = 1.0 },
  { label = 'Fire',            asset = 'core', name = 'ent_ray_heli_aprtmnt_l_fire', scale = 0.5 },
  { label = 'Flare',           asset = 'core', name = 'exp_grd_flare', scale = 1.0 },
  { label = 'Water drips',     asset = 'core', name = 'ent_amb_water_drips_lg', scale = 1.0 },
  { label = 'Water splash',    asset = 'core', name = 'liquid_splash_water', scale = 1.0 },
  { label = 'Wash jet',        asset = 'scr_carwash', name = 'ent_amb_car_wash_jet', scale = 1.0 },
  { label = 'Thermite burn',   asset = 'scr_ornate_heist', name = 'scr_heist_ornate_thermal_burn', scale = 1.0 },
  { label = 'Heavy plume',     asset = 'scr_trevor3', name = 'scr_trev3_trailer_plume', scale = 0.4 },
  { label = 'Agency smoke',    asset = 'scr_agencyheistb', name = 'scr_env_agency3b_smoke', scale = 0.5 },
  { label = 'Firework trail',  asset = 'scr_indep_fireworks', name = 'scr_indep_firework_trailburst', scale = 1.0 },
  { label = 'Magic puff',      asset = 'scr_rcbarry2', name = 'scr_clown_appears', scale = 1.0 },
}

-- Timecycle modifier presets for studio color grading.
Catalog.looks = {
  { label = 'None', name = '' },
  { label = 'Cinema', name = 'cinema' },
  { label = 'Film 01', name = 'NG_filmic01' },
  { label = 'Film 04', name = 'NG_filmic04' },
  { label = 'Film 10', name = 'NG_filmic10' },
  { label = 'Film 15', name = 'NG_filmic15' },
  { label = 'Film 20', name = 'NG_filmic20' },
  { label = 'Saturated', name = 'rply_saturation' },
  { label = 'Contrast', name = 'rply_contrast' },
  { label = 'Bright', name = 'rply_brightness' },
  { label = 'Vignette', name = 'rply_vignette' },
  { label = 'Bloom', name = 'BloomLight' },
  { label = 'Soft hint', name = 'Hint_cam' },
}

Catalog.weathers = {
  'EXTRASUNNY', 'CLEAR', 'CLOUDS', 'OVERCAST', 'SMOG', 'FOGGY', 'CLEARING', 'RAIN', 'THUNDER', 'NEUTRAL', 'SNOWLIGHT', 'SNOW', 'BLIZZARD', 'XMAS', 'HALLOWEEN',
}

-- Frontend audio sound sets and audio names.
Catalog.sounds = {
  { label = 'Pick up',       name = 'PICK_UP', set = 'HUD_FRONTEND_DEFAULT_SOUNDSET' },
  { label = 'Select',        name = 'SELECT', set = 'HUD_FRONTEND_DEFAULT_SOUNDSET' },
  { label = 'Purchase',      name = 'PURCHASE', set = 'HUD_LIQUOR_STORE_SOUNDSET' },
  { label = 'Checkpoint',    name = 'CHECKPOINT_PERFECT', set = 'HUD_MINI_GAME_SOUNDSET' },
  { label = 'Hack success',  name = 'Hack_Success', set = 'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS' },
  { label = 'Beep',          name = 'Beep_Red', set = 'DLC_HEIST_HACKING_SNAKE_SOUNDS' },
  { label = 'ATM window',    name = 'ATM_WINDOW', set = 'HUD_FRONTEND_DEFAULT_SOUNDSET' },
}

-- Font Awesome target icon identifiers mapped to preview glyphs.
Catalog.icons = {
  { fa = 'fas fa-hand',             preview = 'Hand' },
  { fa = 'fas fa-hand-holding',     preview = 'HandGrabbing' },
  { fa = 'fas fa-box-open',         preview = 'Package' },
  { fa = 'fas fa-box',              preview = 'Cube' },
  { fa = 'fas fa-wrench',           preview = 'Wrench' },
  { fa = 'fas fa-screwdriver-wrench', preview = 'Toolbox' },
  { fa = 'fas fa-gear',             preview = 'Gear' },
  { fa = 'fas fa-wind',             preview = 'Wind' },
  { fa = 'fas fa-fire',             preview = 'Fire' },
  { fa = 'fas fa-droplet',          preview = 'Drop' },
  { fa = 'fas fa-bolt',             preview = 'Lightning' },
  { fa = 'fas fa-power-off',        preview = 'Power' },
  { fa = 'fas fa-lock',             preview = 'Lock' },
  { fa = 'fas fa-lock-open',        preview = 'LockOpen' },
  { fa = 'fas fa-key',              preview = 'Key' },
  { fa = 'fas fa-door-open',        preview = 'Door' },
  { fa = 'fas fa-eye',              preview = 'Eye' },
  { fa = 'fas fa-magnifying-glass', preview = 'MagnifyingGlass' },
  { fa = 'fas fa-cart-shopping',    preview = 'ShoppingCart' },
  { fa = 'fas fa-dollar-sign',      preview = 'CurrencyDollar' },
  { fa = 'fas fa-mug-hot',          preview = 'Coffee' },
  { fa = 'fas fa-utensils',         preview = 'ForkKnife' },
  { fa = 'fas fa-chair',            preview = 'Chair' },
  { fa = 'fas fa-bed',              preview = 'Bed' },
  { fa = 'fas fa-music',            preview = 'MusicNote' },
  { fa = 'fas fa-lightbulb',        preview = 'Lightbulb' },
  { fa = 'fas fa-hammer',           preview = 'Hammer' },
  { fa = 'fas fa-gas-pump',         preview = 'GasPump' },
  { fa = 'fas fa-car',              preview = 'Car' },
  { fa = 'fas fa-tire',             preview = 'Tire' },
  { fa = 'fas fa-clipboard',        preview = 'Clipboard' },
  { fa = 'fas fa-trash',            preview = 'Trash' },
  { fa = 'fas fa-recycle',          preview = 'Recycle' },
  { fa = 'fas fa-circle-info',      preview = 'Info' },
  { fa = 'fas fa-temperature-half', preview = 'Thermometer' },
  { fa = 'fas fa-gauge',            preview = 'Gauge' },
}
