/**
 * Checks the declarations each package publishes, as a consumer reads them.
 * Run after `pnpm build`.
 *
 * 1. A workspace import by a subpath its package does not export, such as
 *    `foldkit-mixins/capability`, would not resolve once installed.
 * 2. Every exported subpath is imported by a consumer compiled with
 *    `skipLibCheck: false`. The declaration emitter can expand a type its
 *    source only names into one that does not check on its own (TS2536 in
 *    `foldkit-form` 0.8.1), and the workspace, which reads source and skips
 *    library checks, never sees it.
 *
 *   node scripts/published-types.mjs [package-dir ...]
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { availableParallelism } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
const only = process.argv.slice(2)

const manifests = new Map()
for (const dir of readdirSync(packagesDir)) {
  const manifest = join(packagesDir, dir, 'package.json')
  if (existsSync(manifest)) manifests.set(dir, JSON.parse(readFileSync(manifest, 'utf8')))
}

const exported = new Map(
  [...manifests.values()].map(pkg => [
    pkg.name,
    new Set(
      Object.keys(pkg.exports ?? {}).map(sub => (sub === '.' ? pkg.name : pkg.name + sub.slice(1))),
    ),
  ]),
)

const walk = path =>
  statSync(path).isDirectory() ? readdirSync(path).flatMap(name => walk(join(path, name))) : [path]

const problems = []
for (const dir of manifests.keys()) {
  const dist = join(packagesDir, dir, 'dist')
  if (!existsSync(dist)) continue
  for (const file of walk(dist).filter(path => /\.d\.m?ts$/.test(path))) {
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

// The probe sits in the package's own `node_modules`, so every import resolves
// as it would for an application that installed the package: by the package's
// name, through `types`, with no `foldkit-plus:source` condition. The package
// is linked into the probe's own `node_modules` as well, since a reference
// directive, unlike an import, does not resolve a package's own name. `lib` is
// ESNext because Effect's own declarations need it.
const consumerOptions = {
  target: 'ES2022',
  lib: ['ESNext', 'DOM', 'DOM.Iterable'],
  module: 'ESNext',
  moduleResolution: 'bundler',
  strict: true,
  skipLibCheck: false,
  noEmit: true,
  types: ['node'],
}

const consume = dir =>
  new Promise(done => {
    const pkg = manifests.get(dir)
    const subpaths = Object.entries(pkg.exports ?? {})
      .filter(([, target]) => typeof target === 'object' && target.types !== undefined)
      .map(([sub, target]) => ({
        name: sub === '.' ? pkg.name : pkg.name + sub.slice(1),
        types: target.types,
      }))
    const probe = join(packagesDir, dir, 'node_modules', '.published-types')
    rmSync(probe, { recursive: true, force: true })
    mkdirSync(join(probe, 'node_modules'), { recursive: true })
    // A junction needs no privilege on Windows; elsewhere the type is ignored.
    symlinkSync(join(packagesDir, dir), join(probe, 'node_modules', pkg.name), 'junction')
    // A subpath whose declarations are ambient (`foldkit-media/client`, the
    // type of a `?image` import) is no module: a consumer names it in `types`,
    // which a reference directive does the same as. TypeScript ignores a
    // directive after the first statement, silently (#278), so the directives
    // come first, and the compile lists its files to prove each was read.
    const ambient = subpaths.filter(
      ({ types }) =>
        !/^(?:import|export)\b/m.test(readFileSync(join(packagesDir, dir, types), 'utf8')),
    )
    const modules = subpaths.filter(subpath => !ambient.includes(subpath))
    writeFileSync(
      join(probe, 'consumer.ts'),
      ambient.map(({ name }) => `/// <reference types="${name}" />\n`).join('') +
        modules
          .map(
            ({ name }, i) =>
              `import type * as M${i} from '${name}'\nexport type T${i} = typeof M${i}\n`,
          )
          .join('') +
        'export {}\n',
    )
    writeFileSync(
      join(probe, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: consumerOptions, files: ['consumer.ts'] }),
    )
    const child = spawn(process.execPath, [tsc, '-p', probe, '--pretty', 'false', '--listFiles'], {
      cwd: probe,
    })
    let output = ''
    child.stdout.on('data', chunk => (output += chunk))
    child.stderr.on('data', chunk => (output += chunk))
    child.on('close', code => {
      // A line naming a file that exists is `--listFiles` output. A
      // dependency's own declarations are not ours to fix, and several do not
      // check on their own (miniflare's, drizzle-orm 0.45's, better-auth's
      // reaching for `bun:sqlite`), so a diagnostic counts only in a file
      // outside the store. Indented lines continue the diagnostic above them.
      const diagnostics = []
      const read = new Set()
      for (const line of output.split(/\r?\n/)) {
        if (line.trim() === '') continue
        if (isAbsolute(line) && existsSync(line)) {
          read.add(realpathSync(line))
          continue
        }
        if (/^\s/.test(line) && diagnostics.length > 0) {
          diagnostics.at(-1).lines.push(line)
          continue
        }
        const at = line.match(/^(.+?)\(\d+,\d+\): error/)
        const file = at === null ? '' : relative(root, resolve(probe, at[1])).split(sep).join('/')
        diagnostics.push({
          ours: !file.includes('node_modules/.pnpm/'),
          lines: [at === null ? line : file + line.slice(at[1].length)],
        })
      }
      const unread = ambient
        .filter(({ types }) => !read.has(realpathSync(join(packagesDir, dir, types))))
        .map(({ name, types }) => `${name} (${types}) is not part of the consumer's program`)
      rmSync(probe, { recursive: true, force: true })
      done({
        dir,
        failed: code !== 0 && diagnostics.length === 0,
        lines: [...diagnostics.filter(d => d.ours).flatMap(d => d.lines), ...unread],
      })
    })
  })

const targets = [...manifests.keys()].filter(
  dir =>
    (only.length === 0 || only.includes(dir)) &&
    existsSync(join(packagesDir, dir, 'dist')) &&
    Object.keys(manifests.get(dir).exports ?? {}).length > 0,
)
const queue = [...targets]
const results = []
await Promise.all(
  Array.from({ length: Math.max(1, Math.min(availableParallelism() - 1, 8)) }, async () => {
    for (let dir = queue.shift(); dir !== undefined; dir = queue.shift())
      results.push(await consume(dir))
  }),
)
for (const { dir, failed, lines } of results.sort((a, b) => a.dir.localeCompare(b.dir)))
  if (lines.length > 0 || failed)
    problems.push(
      `packages/${dir}: a consumer with skipLibCheck: false fails\n` +
        (failed ? ['tsc failed with no diagnostic'] : lines).map(line => `  ${line}`).join('\n'),
    )

const unique = [...new Set(problems)].sort()
if (unique.length > 0) {
  console.error(unique.join('\n'))
  process.exit(1)
}
console.log(
  `published-types: every workspace import in the declarations is exported, and ${targets.length} packages check as a consumer reads them`,
)
