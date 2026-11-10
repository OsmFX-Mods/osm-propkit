// Vendors only the Phosphor icons a script uses, read from a sibling script's local install, into one TS file
// node scripts/vendor-icons.mjs <phosphor dist/defs dir> [Name ...], names default to scripts/icons.txt, output is src/lib/icons.data.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [defs, ...args] = process.argv.slice(2)
const out = join(here, '../src/lib/icons.data.ts')
const names = args.length ? args : readFileSync(join(here, 'icons.txt'), 'utf8').split(/\s+/).filter(Boolean)
const WEIGHTS = ['regular', 'duotone', 'fill']
const l = { Fragment: '#', createElement: (t, p, ...c) => ({ t, p: p ?? {}, c }) }

const flat = (node, acc = []) => {
  if (!node) return acc
  if (node.t === '#') node.c.forEach((c) => flat(c, acc))
  else acc.push([node.t, node.p])
  return acc
}

const missing = []
const lines = []
for (const name of [...new Set(names)].sort()) {
  const file = join(defs, `${name}.es.js`)
  if (!existsSync(file)) { missing.push(name); continue }
  const raw = readFileSync(file, 'utf8')
  const react = raw.match(/import \* as (\w+) from "react";/)[1]
  const src = raw.replace(/import \* as \w+ from "react";/, '').replace(/export \{\s*(\w+) as default\s*\};?/, 'return $1;')
  const map = new Function(react, src)(l)
  const w = WEIGHTS.map((k) => flat(map.get(k)))
  lines.push(`  ${name}: ${JSON.stringify(w)},`)
}

const head = `/* Icons: the Phosphor glyphs this script uses (MIT, phosphoricons.com), vendored so the UI ships only what it draws.
   Add a name to ui/scripts/icons.txt and rerun ui/scripts/vendor-icons.mjs to regenerate. Weights: regular, duotone, fill. */
type El = [string, Record<string, string>]
export const PATHS = {
`
writeFileSync(out, head + lines.join('\n') + '\n} satisfies Record<string, [El[], El[], El[]]>\n\nexport type IconName = keyof typeof PATHS\n')
console.log(`wrote ${lines.length} icons`, missing.length ? `missing: ${missing.join(', ')}` : '')
