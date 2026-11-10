-- Database persistence layer with automated schema initialization and double-precision coordinate storage.
Db = {}

local TABLES = {
  [[CREATE TABLE IF NOT EXISTS `osm_propkit_models` (
    `model` VARCHAR(64) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `category` VARCHAR(40) NOT NULL DEFAULT 'Uncategorised',
    `data` LONGTEXT NOT NULL,
    `pack_id` VARCHAR(48) NULL DEFAULT NULL,
    `origin_hash` VARCHAR(16) NULL DEFAULT NULL,
    `modified` TINYINT(1) NOT NULL DEFAULT 0,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`model`),
    KEY `pack` (`pack_id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
  [[CREATE TABLE IF NOT EXISTS `osm_propkit_placements` (
    `id` VARCHAR(32) NOT NULL,
    `model` VARCHAR(64) NOT NULL,
    `x` DOUBLE NOT NULL, `y` DOUBLE NOT NULL, `z` DOUBLE NOT NULL,
    `rx` DOUBLE NOT NULL DEFAULT 0, `ry` DOUBLE NOT NULL DEFAULT 0, `rz` DOUBLE NOT NULL DEFAULT 0,
    `data` LONGTEXT NOT NULL,
    `enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `pack_id` VARCHAR(48) NULL DEFAULT NULL,
    `pack_key` VARCHAR(64) NULL DEFAULT NULL,
    `origin_hash` VARCHAR(16) NULL DEFAULT NULL,
    `modified` TINYINT(1) NOT NULL DEFAULT 0,
    `created_by` VARCHAR(64) NULL DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `pack_item` (`pack_id`, `pack_key`),
    KEY `model` (`model`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
  [[CREATE TABLE IF NOT EXISTS `osm_propkit_scenes` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `model` VARCHAR(64) NULL DEFAULT NULL,
    `data` LONGTEXT NOT NULL,
    `pack_id` VARCHAR(48) NULL DEFAULT NULL,
    `pack_key` VARCHAR(64) NULL DEFAULT NULL,
    `origin_hash` VARCHAR(16) NULL DEFAULT NULL,
    `modified` TINYINT(1) NOT NULL DEFAULT 0,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `pack_item` (`pack_id`, `pack_key`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
  [[CREATE TABLE IF NOT EXISTS `osm_propkit_packs` (
    `id` VARCHAR(48) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `version` VARCHAR(24) NOT NULL,
    `author` VARCHAR(80) NULL DEFAULT NULL,
    `source` VARCHAR(120) NULL DEFAULT NULL,
    `meta` LONGTEXT NULL,
    `installed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
  [[CREATE TABLE IF NOT EXISTS `osm_propkit_shots` (
    `id` VARCHAR(32) NOT NULL,
    `file` VARCHAR(255) NOT NULL,
    `model` VARCHAR(64) NULL DEFAULT NULL,
    `scene` VARCHAR(80) NULL DEFAULT NULL,
    `width` INT NOT NULL DEFAULT 0,
    `height` INT NOT NULL DEFAULT 0,
    `bytes` INT NOT NULL DEFAULT 0,
    `thumb` MEDIUMTEXT NULL,
    `url` VARCHAR(400) NULL DEFAULT NULL,
    `created_by` VARCHAR(64) NULL DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `model` (`model`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
}

function Db.init()
  for _, q in ipairs(TABLES) do MySQL.query.await(q) end
end

-- Model profile database operations.

function Db.models()
  return MySQL.query.await('SELECT model, data, pack_id, origin_hash, modified FROM osm_propkit_models') or {}
end

function Db.saveModel(m, meta)
  MySQL.query.await([[INSERT INTO osm_propkit_models (model, label, category, data, pack_id, origin_hash, modified)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE label = VALUES(label), category = VALUES(category), data = VALUES(data),
      pack_id = VALUES(pack_id), origin_hash = VALUES(origin_hash), modified = VALUES(modified)]],
    { m.model, m.label, m.category, Util.encode(m), meta.pack, meta.hash, meta.modified and 1 or 0 })
end

function Db.deleteModel(model)
  MySQL.query.await('DELETE FROM osm_propkit_models WHERE model = ?', { model })
end

-- Placement record database operations.

local function placementData(p)
  local d = Util.copy(p)
  d.id, d.model, d.pos, d.rot, d.enabled = nil, nil, nil, nil, nil
  return Util.encode(d)
end

function Db.placements()
  return MySQL.query.await([[SELECT id, model, x, y, z, rx, ry, rz, data, enabled, pack_id, pack_key, origin_hash, modified
    FROM osm_propkit_placements]]) or {}
end

function Db.savePlacement(p, meta)
  MySQL.query.await([[INSERT INTO osm_propkit_placements (id, model, x, y, z, rx, ry, rz, data, enabled, pack_id, pack_key, origin_hash, modified, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE model = VALUES(model), x = VALUES(x), y = VALUES(y), z = VALUES(z),
      rx = VALUES(rx), ry = VALUES(ry), rz = VALUES(rz), data = VALUES(data), enabled = VALUES(enabled),
      pack_id = VALUES(pack_id), pack_key = VALUES(pack_key), origin_hash = VALUES(origin_hash), modified = VALUES(modified)]],
    { p.id, p.model, p.pos.x, p.pos.y, p.pos.z, p.rot.x, p.rot.y, p.rot.z, placementData(p), p.enabled ~= false and 1 or 0,
      meta.pack, meta.key, meta.hash, meta.modified and 1 or 0, meta.by })
end

-- Executes transactional batch inserts for placement collections.
function Db.savePlacements(list)
  if #list == 0 then return end
  local queries = {}
  for _, it in ipairs(list) do
    local p, meta = it[1], it[2]
    queries[#queries + 1] = {
      query = [[INSERT INTO osm_propkit_placements (id, model, x, y, z, rx, ry, rz, data, enabled, pack_id, pack_key, origin_hash, modified, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE model = VALUES(model), x = VALUES(x), y = VALUES(y), z = VALUES(z),
          rx = VALUES(rx), ry = VALUES(ry), rz = VALUES(rz), data = VALUES(data), enabled = VALUES(enabled),
          pack_id = VALUES(pack_id), pack_key = VALUES(pack_key), origin_hash = VALUES(origin_hash), modified = VALUES(modified)]],
      values = { p.id, p.model, p.pos.x, p.pos.y, p.pos.z, p.rot.x, p.rot.y, p.rot.z, placementData(p), p.enabled ~= false and 1 or 0,
        meta.pack, meta.key, meta.hash, meta.modified and 1 or 0, meta.by },
    }
  end
  MySQL.transaction.await(queries)
end

function Db.deletePlacement(id)
  MySQL.query.await('DELETE FROM osm_propkit_placements WHERE id = ?', { id })
end

-- Studio scene database operations.

function Db.scenes()
  return MySQL.query.await('SELECT id, name, model, data, pack_id, pack_key, origin_hash, modified FROM osm_propkit_scenes') or {}
end

function Db.saveScene(s, meta)
  MySQL.query.await([[INSERT INTO osm_propkit_scenes (id, name, model, data, pack_id, pack_key, origin_hash, modified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE name = VALUES(name), model = VALUES(model), data = VALUES(data),
      pack_id = VALUES(pack_id), pack_key = VALUES(pack_key), origin_hash = VALUES(origin_hash), modified = VALUES(modified)]],
    { s.id, s.name, s.model, Util.encode(s.data), meta.pack, meta.key, meta.hash, meta.modified and 1 or 0 })
end

function Db.deleteScene(id)
  MySQL.query.await('DELETE FROM osm_propkit_scenes WHERE id = ?', { id })
end

-- Pack metadata database operations.

function Db.packs()
  return MySQL.query.await('SELECT id, name, version, author, source, meta, UNIX_TIMESTAMP(installed_at) AS installed FROM osm_propkit_packs') or {}
end

function Db.savePack(p, source)
  MySQL.query.await([[INSERT INTO osm_propkit_packs (id, name, version, author, source, meta) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE name = VALUES(name), version = VALUES(version), author = VALUES(author), source = VALUES(source), meta = VALUES(meta)]],
    { p.id, p.name, p.version, p.author, source, Util.encode({ description = p.description, url = p.url }) })
end

function Db.deletePack(id)
  MySQL.query.await('DELETE FROM osm_propkit_packs WHERE id = ?', { id })
end

-- Studio capture database operations.

function Db.shots(limit)
  return MySQL.query.await([[SELECT id, file, model, scene, width, height, bytes, thumb, url, UNIX_TIMESTAMP(created_at) AS created
    FROM osm_propkit_shots ORDER BY created_at DESC LIMIT ?]], { limit or 120 }) or {}
end

function Db.saveShot(s)
  MySQL.insert.await([[INSERT INTO osm_propkit_shots (id, file, model, scene, width, height, bytes, thumb, url, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)]],
    { s.id, s.file, s.model, s.scene, s.width or 0, s.height or 0, s.bytes or 0, s.thumb, s.url, s.by })
end

function Db.shotUrl(id, url)
  MySQL.update.await('UPDATE osm_propkit_shots SET url = ? WHERE id = ?', { url, id })
end

function Db.shot(id)
  return MySQL.single.await('SELECT id, file, model, thumb FROM osm_propkit_shots WHERE id = ?', { id })
end

function Db.deleteShot(id)
  MySQL.query.await('DELETE FROM osm_propkit_shots WHERE id = ?', { id })
end
