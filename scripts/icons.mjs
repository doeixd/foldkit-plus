/**
 * A package's icons, as constants: a package cannot rely on an application's
 * Vite plugin (`foldkit-media/vite`), so it commits the `IconData` it draws.
 * Each `icons.json` beside a package's or example's `package.json` names what
 * it draws and from which Iconify set, any of them:
 *
 *   { "out": "src/iconData.ts", "icons": { "paragraph": "lucide:pilcrow" } }
 *
 * or an array of such specs, one file each. `"as"` picks what a file holds:
 * `IconData` (`data`, the default), CSS mask `url()`s (`masks`), or `IconData`
 * and where an application imports each from (`pack`). `"stroke": { "width": 2 }`
 * redraws every icon's strokes at that width.
 *
 * The set is the root's `@iconify-json/<prefix>`, read through the same
 * parser as the plugin's, so a package's icons meet the same allowlist.
 *
 *   pnpm icons          write every `out`
 *   pnpm icons:check    fail when an `out` differs from what it would write
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'oxfmt'
import { Schema } from 'effect'
import { maskUrl, withStroke } from '../packages/media/src/icon.ts'
import { fromIconify, IconifySet } from '../packages/media/src/icons/index.ts'
import { exportName } from '../packages/media/src/vite/index.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const { $schema: _, ...formatConfig } = JSON.parse(
  readFileSync(join(root, '.oxfmtrc.jsonc'), 'utf8'),
)
const check = process.argv.includes('--check')
const posix = path => path.split(sep).join('/')

const Spec = Schema.Struct({
  out: Schema.String,
  // `data` (the default) writes `IconData`; `masks` writes each icon's CSS mask
  // `url()`, for a package that must not depend on `foldkit-media`; `pack` writes
  // `IconData` and where an application imports each from (its set, and its name
  // in `virtual:foldkit-icons/<set>`), for a page that writes that import.
  as: Schema.optional(Schema.Literals(['data', 'masks', 'pack'])),
  icons: Schema.Record(Schema.String, Schema.String),
  // Each icon's strokes redrawn at this width, for a set drawn at another
  // than the one a package ships (Heroicons' 1.5px under a 2px default).
  stroke: Schema.optional(Schema.Struct({ width: Schema.Number })),
})

const sets = new Map()
const setOf = prefix => {
  if (!sets.has(prefix)) {
    const dir = join(root, 'node_modules', '@iconify-json', prefix)
    if (!existsSync(dir)) throw new Error(`The Iconify set "${prefix}" is not installed: add @iconify-json/${prefix} at the root.`)
    const read = file => JSON.parse(readFileSync(join(dir, file), 'utf8'))
    sets.set(prefix, {
      set: Schema.decodeUnknownSync(IconifySet)(read('icons.json')),
      info: read('info.json'),
      version: read('package.json').version,
    })
  }
  return sets.get(prefix)
}

const specs = ['packages', 'examples', 'examples/foldkit']
  .flatMap(folder => readdirSync(join(root, folder)).map(name => join(root, folder, name)))
  .filter(dir => statSync(dir).isDirectory() && existsSync(join(dir, 'icons.json')))

const stale = []
let written = 0
let files = 0
// One spec, or several for a package that writes more than one file.
const Specs = Schema.Union([Spec, Schema.Array(Spec)])

for (const dir of specs) {
  const where = posix(relative(root, join(dir, 'icons.json')))
  const read = Schema.decodeUnknownSync(Specs, { onExcessProperty: 'error' })(
    JSON.parse(readFileSync(join(dir, 'icons.json'), 'utf8')),
  )
  for (const spec of Array.isArray(read) ? read : [read]) {
    const used = new Set()
    const entries = Object.entries(spec.icons).map(([name, source]) => {
      const [prefix, icon, extra] = source.split(':')
      if (icon === undefined || extra !== undefined) {
        throw new Error(`${where}: "${name}" names "${source}", not "<set>:<icon>".`)
      }
      used.add(prefix)
      const drawn = fromIconify(setOf(prefix).set, icon)
      return [
        name,
        spec.stroke === undefined ? drawn : withStroke(drawn, spec.stroke),
        { set: prefix, name: exportName(icon) },
      ]
    })
    const credits = [...used].sort().map(prefix => {
      const { info, version } = setOf(prefix)
      // Not every set names where its license lives.
      const where = info.license.url === undefined ? '' : `, ${info.license.url}`
      return `// ${info.name} (${info.license.spdx}, ${info.author.name}): @iconify-json/${prefix} ${version}${where}`
    })
    const names = `export type IconName = ${entries.map(([name]) => JSON.stringify(name)).join(' | ')}`
    const text = [
      `// Written by \`pnpm icons\` from icons.json. Do not edit.`,
      ...credits,
      ...(spec.as === 'masks'
        ? [
            names,
            '',
            `export const masks: { readonly [Name in IconName]: string } = ${JSON.stringify(Object.fromEntries(entries.map(([name, icon]) => [name, maskUrl(icon)])))}`,
          ]
        : [
            `import type { IconData } from 'foldkit-media'`,
            '',
            names,
            '',
            `export const icons: { readonly [Name in IconName]: IconData } = ${JSON.stringify(Object.fromEntries(entries.map(([name, icon]) => [name, icon])))}`,
            ...(spec.as === 'pack'
              ? [
                  '',
                  '/** Where an application imports each icon from: its set, and its name in `virtual:foldkit-icons/<set>`. */',
                  `export const imports: { readonly [Name in IconName]: { readonly set: string; readonly name: string } } = ${JSON.stringify(Object.fromEntries(entries.map(([name, , from]) => [name, from])))}`,
                ]
              : []),
          ]),
      '',
    ].join('\n')
    const out = join(dir, spec.out)
    files += 1
    const formatted = await format(out, text, formatConfig)
    if (formatted.errors.length > 0) throw new Error(`${out}: ${formatted.errors[0].message}`)
    const current = existsSync(out) ? readFileSync(out, 'utf8') : undefined
    if (current === formatted.code) continue
    if (check) stale.push(posix(relative(root, out)))
    else {
      writeFileSync(out, formatted.code)
      written += 1
    }
  }
}

if (stale.length > 0) {
  console.error(`${stale.join('\n')}\n\nRun \`pnpm icons\` to write them again.`)
  process.exit(1)
}
if (!check) console.log(`icons: ${written} of ${files} file(s) written`)
