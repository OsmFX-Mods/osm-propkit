// Server file system operations and remote multipart upload exports.
const fs = require('fs')
const path = require('path')

const RES = GetCurrentResourceName()
// Normalizes root resource directory path.
const ROOT = path.resolve(GetResourcePath(RES))
const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p)

// Validates that relative paths resolve strictly within the resource directory.
function inside(rel) {
  const abs = path.resolve(ROOT, String(rel || ''))
  const a = norm(abs), r = norm(ROOT)
  if (a !== r && !a.startsWith(r + path.sep)) throw new Error('path outside resource')
  return abs
}

exports('fsList', (rel, ext) => {
  try {
    const dir = inside(rel)
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter((n) => !ext || n.toLowerCase().endsWith(ext))
      .map((n) => {
        const st = fs.statSync(path.join(dir, n))
        return { name: n, size: st.size, mtime: Math.floor(st.mtimeMs / 1000), dir: st.isDirectory() }
      })
  } catch (e) {
    console.log(`^1[propkit] list ${rel}: ${e.message}^7`)
    return []
  }
})

exports('fsRead', (rel) => {
  try { return fs.readFileSync(inside(rel), 'utf8') } catch { return null }
})

exports('fsWrite', (rel, content) => {
  try {
    const abs = inside(rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, String(content), 'utf8')
    return abs
  } catch (e) {
    console.log(`^1[propkit] write ${rel}: ${e.message}^7`)
    return null
  }
})

// Decodes and writes base64 data to binary files.
exports('fsWriteBase64', (rel, data) => {
  try {
    const abs = inside(rel)
    const b64 = String(data).replace(/^data:[^;]+;base64,/, '')
    const buf = Buffer.from(b64, 'base64')
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, buf)
    return { path: abs, bytes: buf.length }
  } catch (e) {
    console.log(`^1[propkit] write ${rel}: ${e.message}^7`)
    return null
  }
})

exports('fsDelete', (rel) => {
  try { fs.unlinkSync(inside(rel)); return true } catch { return false }
})

exports('fsAbs', (rel) => {
  try { return inside(rel) } catch { return null }
})

// Dispatches multipart HTTP file uploads to remote webhooks or storage endpoints.
exports('upload', (cfg, rel, filename, mime, cb) => {
  const done = (ok, v) => { try { cb(ok, v) } catch {} }
  ;(async () => {
    try {
      const buf = fs.readFileSync(inside(rel))
      const form = new FormData()
      const blob = new Blob([buf], { type: mime })
      const headers = {}
      let url = cfg.url
      if (cfg.type === 'discord') {
        form.append('files[0]', blob, filename)
        form.append('payload_json', JSON.stringify({ content: cfg.message || '', attachments: [{ id: 0, filename }] }))
      } else if (cfg.type === 'fivemanage') {
        url = url || 'https://api.fivemanage.com/api/v3/file'
        headers.Authorization = cfg.token
        form.append('file', blob, filename)
      } else {
        if (cfg.token) headers.Authorization = cfg.token
        form.append(cfg.field || 'file', blob, filename)
      }
      const res = await fetch(url, { method: 'POST', body: form, headers })
      const text = await res.text()
      let link = ''
      try {
        const j = JSON.parse(text)
        link = (j.attachments && j.attachments[0] && j.attachments[0].url) || (j.data && j.data.url) || j.url || ''
      } catch {}
      done(res.ok, res.ok ? link : `${res.status} ${text.slice(0, 200)}`)
    } catch (e) {
      done(false, e.message)
    }
  })()
})
