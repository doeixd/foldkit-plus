/**
 * Fails when a package's built declarations import a workspace package by a
 * subpath that package does not export, such as `foldkit-mixins/capability`:
 * the types a consumer installs would not resolve. Run after `pnpm build`.
 *
 *   node scripts/published-types.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')

const exported = new Map()
for (const dir of readdirSync(packagesDir)) {
  const manifest = join(packagesDir, dir, 'package.json')
  if (!existsSync(manifest)) continue
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  exported.set(
    pkg.name,
    new Set(
      Object.keys(pkg.exports ?? {}).map(sub => (sub === '.' ? pkg.name : pkg.name + sub.slice(1))),
    ),
  )
}

const walk = path =>
  statSync(path).isDirectory() ? readdirSync(path).flatMap(name => walk(join(path, name))) : [path]

const problems = []
for (const dir of readdirSync(packagesDir)) {
  const dist = join(packagesDir, dir, 'dist')
  if (!existsSync(dist)) continue
  for (const file of walk(dist).filter(path => path.endsWith('.d.mts'))) {
    const text = readFileSync(file, 'utf8')
    for (const [, name, subpath = ''] of text.matchAll(
      /(?:from |import\()["'](foldkit-[a-z-]+)(\/[^"']+)?["']/g,
    )) {
      const known = exported.get(name)
      if (known !== undefined && !known.has(name + subpath))
        problems.push(`packages/${dir}/dist: ${name + subpath} is not exported by ${name}`)
    }
  }
}

const unique = [...new Set(problems)].sort()
if (unique.length > 0) {
  console.error(unique.join('\n'))
  process.exit(1)
}
console.log('published-types: every workspace import in the declarations is exported')
