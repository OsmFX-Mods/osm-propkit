fx_version 'cerulean'
game 'gta5'
lua54 'yes'
node_version '22'

name 'osm-propkit'
author 'OsmFX'
description 'PropKit: place, persist, wire interactions and shoot studio photos for any prop. Ships with pack import/export so every prop can carry its own defaults.'
version '1.0.0'

dependencies {
  '/onesync',
  'ox_lib',
  'oxmysql',
}

ui_page 'html/index.html'

files {
  'html/index.html',
  'html/assets/*.js',
  'html/assets/*.css',
  'html/assets/*.woff2',
  'html/assets/*.woff',
}

shared_scripts {
  '@ox_lib/init.lua',
  'config/config.lua',
  'config/catalog.lua',
  'config/locale.lua',
  'shared/util.lua',
  'shared/rot.lua',
  'shared/schema.lua',
  'shared/gates.lua',
}

server_scripts {
  '@oxmysql/lib/MySQL.lua',
  'server/files.js',
  'bridge/server.lua',
  'server/db.lua',
  'server/store.lua',
  'server/packs.lua',
  'server/network.lua',
  'server/runner.lua',
  'server/shots.lua',
  'server/main.lua',
}

client_scripts {
  'bridge/client.lua',
  'bridge/target.lua',
  'client/ui.lua',
  'client/state.lua',
  'client/stream.lua',
  'client/interact.lua',
  'client/cam.lua',
  'client/editor.lua',
  'client/studio.lua',
  'client/main.lua',
}
