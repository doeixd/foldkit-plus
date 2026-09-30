/**
 * S1: the browser entry's module graph reaches no `foldkit/experimental/server`.
 * A page that only takes a server render over must not carry Foldkit's server
 * renderer and HTML parser (~210 KB). A static import walk, not a bundle size:
 * from `src/client.ts`, every static and dynamic-literal import is followed —
 * repo files, workspace packages through their `foldkit-plus:source` entry,
 * and upstream `foldkit/*` through the installed files — and reaching the
 * server renderer fails. Bare third-party imports (`effect`, `drizzle-orm`,
 * `@foldkit/ui`, `node:*`) are trusted: the renderer lives in Foldkit's own
 * tree, which is walked fully.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const posix = (path: string) => path.split(sep).join('/')

/** Every workspace package's specifiers to their source files. */
const sources = new Map<string, string>()
for (const entry of readdirSync(join(root, 'packages'))) {
  const manifest = join(root, 'packages', entry, 'package.json')
  if (!statSync(join(root, 'packages', entry)).isDirectory() || !existsSync(manifest)) continue
  const { name, exports } = JSON.parse(readFileSync(manifest, 'utf8')) as {
    readonly name: string
    readonly exports: Record<string, { readonly 'foldkit-plus:source'?: string }>
  }
  for (const [subpath, target] of Object.entries(exports ?? {})) {
    const source = target['foldkit-plus:source']
    if (source === undefined) continue
    sources.set(
      subpath === '.' ? name : `${name}${subpath.slice(1)}`,
      join(root, 'packages', entry, source),
    )
  }
}

const candidates = (file: string): Array<string> => {
  if (existsSync(file)) return [file]
  if (file.endsWith('.js')) {
    for (const replacement of [file.slice(0, -3) + '.ts', file.slice(0, -3) + '.tsx']) {
      if (existsSync(replacement)) return [replacement]
    }
  }
  if (!/\.[a-z]+$/.test(file) && existsSync(`${file}.js`)) return [`${file}.js`]
  for (const index of [join(file, 'index.ts'), join(file, 'index.tsx'), join(file, 'index.js')]) {
    if (existsSync(index)) return [index]
  }
  return []
}

/** The nearest `node_modules/foldkit`, as Node would find it from `from`. */
const foldkitDir = (from: string): string => {
  let dir = dirname(from)
  while (true) {
    if (existsSync(join(dir, 'node_modules', 'foldkit', 'package.json')))
      return join(dir, 'node_modules', 'foldkit')
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`no foldkit install found from ${from}`)
    dir = parent
  }
}

/** Resolves an import to a file to walk, or null for a trusted bare import. */
const resolveImport = (specifier: string, from: string): string | null => {
  if (specifier.startsWith('.')) {
    const found = candidates(resolve(dirname(from), specifier))
    if (found.length === 0)
      throw new Error(`unresolvable relative import ${specifier} from ${from}`)
    return found[0]!
  }
  const source = sources.get(specifier)
  if (source !== undefined) return source
  if (specifier === 'foldkit' || specifier.startsWith('foldkit/')) {
    // The `import` condition, as Vite resolves it: `require` has no entry.
    const dir = foldkitDir(from)
    const { exports } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      readonly exports: Record<string, { readonly import?: string }>
    }
    const subpath = specifier === 'foldkit' ? '.' : `./${specifier.slice('foldkit/'.length)}`
    const entry = exports[subpath]?.import
    if (entry === undefined) throw new Error(`no import entry for ${specifier} (via ${dir})`)
    return join(dir, entry)
  }
  return null
}

// Type-only imports erase before the bundle; anything else rides it.
const importPattern =
  /(?:^|;|\})\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm

const walk = (entry: string): Set<string> => {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2]!
      if (
        specifier === 'foldkit/experimental/server' ||
        specifier.startsWith('foldkit/experimental/server/')
      ) {
        throw new Error(
          `browser entry reaches the server renderer: ${specifier} (via ${posix(file)})`,
        )
      }
      const resolved = resolveImport(specifier, file)
      if (resolved !== null && !seen.has(resolved)) queue.push(resolved)
    }
  }
  return seen
}

describe('the browser entry', () => {
  it('reaches no server renderer', () => {
    const visited = walk(join(root, 'examples', 'cms', 'src', 'client.ts'))
    // A walk that visits nothing proves nothing: the entry pulls the apps.
    expect(visited.size).toBeGreaterThan(200)
    expect([...visited].some(file => file.endsWith(join('cms', 'src', 'ssr', 'sitePlan.ts')))).toBe(
      true,
    )
    expect([...visited].some(file => file.endsWith(join('ssr', 'src', 'shared.ts')))).toBe(true)
    expect([...visited].some(file => posix(file).includes('foldkit/experimental/server'))).toBe(
      false,
    )
  })
})
