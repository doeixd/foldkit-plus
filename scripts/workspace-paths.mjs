/**
 * Every package's and example's `tsconfig.json` `paths`, derived: each
 * workspace package the project references (and the package itself) maps each
 * of its export subpaths to the source file its `foldkit-plus:source`
 * condition names. A project may map only what it references, since a source
 * file of an unreferenced composite project is refused (TS6307).
 *
 *   node scripts/workspace-paths.mjs          rewrite the paths
 *   node scripts/workspace-paths.mjs --check  fail on a difference, or on an
 *                                             import of an unreferenced package
 *
 * TypeScript keeps `paths` rather than resolving through the export condition:
 * through exports, declaration emit cannot name a type a package reaches only
 * through a namespace re-export (TS2742). See dx-and-builder-PLAN.md, 0b.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import * as prettier from 'prettier'

const root = resolve(
  dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const check = process.argv.includes('--check')
const posix = path => path.split(sep).join('/')
const dirs = folder =>
  readdirSync(join(root, folder))
    .map(name => join(root, folder, name))
    .filter(path => statSync(path).isDirectory())

// Each workspace package: its directory, and its specifiers' source files.
const packages = new Map()
for (const dir of dirs('packages')) {
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) continue
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  const specifiers = []
  for (const [subpath, entry] of Object.entries(pkg.exports ?? {})) {
    if (typeof entry !== 'object' || entry === null) continue
    const source = entry['foldkit-plus:source']
    if (source === undefined) throw new Error(`${pkg.name} "${subpath}" has no foldkit-plus:source`)
    const file = resolve(dir, source)
    if (!existsSync(file)) throw new Error(`${pkg.name} "${subpath}" names a missing ${source}`)
    specifiers.push([subpath === '.' ? pkg.name : pkg.name + subpath.slice(1), file])
  }
  packages.set(dir, { name: pkg.name, specifiers })
}
const byName = new Map([...packages.values()].map(pkg => [pkg.name, pkg]))

/** The workspace package a specifier names, if any: `foldkit-mixins/theme` is `foldkit-mixins`. */
const packageOf = specifier =>
  [...byName.keys()]
    .filter(name => specifier === name || specifier.startsWith(`${name}/`))
    .sort((a, b) => b.length - a.length)[0]

/** Every file under a project's source folders. */
const sourcesOf = dir =>
  ['src', 'test', 'bench', 'example']
    .map(folder => join(dir, folder))
    .filter(existsSync)
    .flatMap(function walk(path) {
      return statSync(path).isDirectory()
        ? readdirSync(path).flatMap(name => (name === 'node_modules' ? [] : walk(join(path, name))))
        : /\.(ts|tsx)$/.test(path)
          ? [path]
          : []
    })

const importPattern = /(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g
const problems = []
const rewritten = []

for (const dir of [...dirs('packages'), ...dirs('examples')]) {
  const tsconfigPath = join(dir, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) continue
  const text = readFileSync(tsconfigPath, 'utf8')
  const tsconfig = JSON.parse(text)
  const referenced = new Set(
    (tsconfig.references ?? []).map(reference => dirname(resolve(dir, reference.path))),
  )
  if (packages.has(dir)) referenced.add(dir)
  const reachable = [...referenced].filter(ref => packages.has(ref)).map(ref => packages.get(ref))

  // What the project imports must be something it references.
  const reachableNames = new Set(reachable.map(pkg => pkg.name))
  for (const file of sourcesOf(dir)) {
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(importPattern)) {
      const name = packageOf(specifier)
      if (name !== undefined && !reachableNames.has(name))
        problems.push(
          `${posix(relative(root, file))} imports ${specifier}, which ${posix(relative(root, tsconfigPath))} does not reference`,
        )
    }
  }

  // A package's build project compiles `src` alone, against its own references.
  const buildPath = join(dir, 'tsconfig.build.json')
  if (packages.has(dir) && existsSync(buildPath)) {
    const build = JSON.parse(readFileSync(buildPath, 'utf8'))
    const built = new Set(
      (build.references ?? [])
        .map(reference => packages.get(dirname(resolve(dir, reference.path)))?.name)
        .filter(name => name !== undefined),
    )
    built.add(packages.get(dir).name)
    for (const file of sourcesOf(dir).filter(file => file.startsWith(join(dir, 'src')))) {
      for (const [, specifier] of readFileSync(file, 'utf8').matchAll(importPattern)) {
        const name = packageOf(specifier)
        if (name !== undefined && !built.has(name))
          problems.push(
            `${posix(relative(root, file))} imports ${specifier}, which ${posix(relative(root, buildPath))} does not reference`,
          )
      }
    }
  }

  const paths = Object.fromEntries(
    reachable
      .flatMap(pkg => pkg.specifiers)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([specifier, file]) => {
        const target = posix(relative(dir, file))
        return [specifier, [target.startsWith('.') ? target : `./${target}`]]
      }),
  )
  const current = JSON.stringify(tsconfig.compilerOptions?.paths ?? {})
  if (current === JSON.stringify(paths)) continue
  if (check) {
    problems.push(
      `${posix(relative(root, tsconfigPath))} has paths that differ from its references`,
    )
    continue
  }
  tsconfig.compilerOptions = { ...tsconfig.compilerOptions, paths }
  // In the repository's style, so a rewrite never fails `format:check`.
  const options = (await prettier.resolveConfig(tsconfigPath)) ?? {}
  writeFileSync(
    tsconfigPath,
    await prettier.format(JSON.stringify(tsconfig, null, 2), {
      ...options,
      filepath: tsconfigPath,
    }),
  )
  rewritten.push(tsconfigPath)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(check ? '\nRun `node scripts/workspace-paths.mjs` to rewrite the paths.' : '')
  process.exit(1)
}
if (!check) {
  console.log(`workspace-paths: ${rewritten.length} tsconfig(s) rewritten`)
}
