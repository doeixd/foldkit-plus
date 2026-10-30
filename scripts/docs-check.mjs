/**
 * Type-checks the TypeScript blocks of the published docs: each package's
 * README, `docs/*.md` (not `docs/design/`) and the `foldkit-plus` skill (#229).
 * A block is a claim a reader copies, so it compiles against the workspace's
 * packages by their published names, as the skill's snippet rule asks.
 *
 * A document reads top to bottom, so its blocks are one module: a block may
 * use what a block above it imported or declared. Three marks change that:
 *
 * - ```ts sketch       a mental model or pseudocode; not compiled.
 * - ```ts standalone   starts a module of its own (an alternative to the
 *                      block above); the blocks after it continue it.
 * - <!-- docs-check    hidden code the reader is assumed to have written
 *    declare const model: Model
 *    -->               (an application's Model, its `h`), compiled in place.
 *
 * Every block must parse. A document in `pending` below has blocks that do
 * not compile yet: its type errors are not failures, but once it compiles it
 * must leave the list, so the list only shrinks.
 *
 * The modules are written to `node_modules/.docs-check`, which references
 * every package, so `tsc -b` reads what `pnpm typecheck` built.
 *
 *   node scripts/docs-check.mjs              check every document
 *   node scripts/docs-check.mjs <file.md>    check these, pending or not
 */
import { spawnSync } from 'node:child_process'
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
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Documents whose blocks do not all compile yet (#229). Remove one once it does. */
const pending = new Set([
  'docs/agents.md',
  'docs/auth-and-guard.md',
  'docs/bundle-vs-submodel.md',
  'docs/declared-writes.md',
  'docs/editing-server-data.md',
  'docs/effect-adjacent-projects.md',
  'docs/errors.md',
  'docs/extensible-DESIGN.md',
  'docs/foldkit-0.158-to-0.163.md',
  'docs/mirror.md',
  'docs/mixins.md',
  'docs/native-cross-platform.md',
  'docs/remote.md',
  'docs/rfc.md',
  'docs/site-and-router.md',
  'docs/site-remote-ssr.md',
  'docs/site.md',
  'docs/state-model.md',
  'docs/surface-vs-bundles.md',
  'docs/sync-dx.md',
  'docs/sync-runtime-binding.md',
  'docs/theme-knobs.md',
  'docs/upstream-combobox-keyboard.md',
  'docs/wiring.md',
  'packages/agent-a2a/README.md',
  'packages/agent-mcp/README.md',
  'packages/agent-native/README.md',
  'packages/agent-webmcp/README.md',
  'packages/agent/README.md',
  'packages/auth/README.md',
  'packages/builder/README.md',
  'packages/bundle-surface/README.md',
  'packages/bundle/README.md',
  'packages/cms-drizzle/README.md',
  'packages/cms/README.md',
  'packages/composition/README.md',
  'packages/crud/README.md',
  'packages/data-grid/README.md',
  'packages/durable/README.md',
  'packages/entity/README.md',
  'packages/form-recipes/README.md',
  'packages/form/README.md',
  'packages/guard/README.md',
  'packages/media/README.md',
  'packages/mirror/README.md',
  'packages/mixins-builder/README.md',
  'packages/mixins-crud/README.md',
  'packages/mixins-form/README.md',
  'packages/mixins-richtext/README.md',
  'packages/mixins-ui/README.md',
  'packages/mixins/README.md',
  'packages/plus/README.md',
  'packages/primitives/README.md',
  'packages/primitives/dom/README.md',
  'packages/primitives/events/README.md',
  'packages/primitives/interaction/README.md',
  'packages/primitives/media/README.md',
  'packages/primitives/net/README.md',
  'packages/primitives/time/README.md',
  'packages/react-codegen/README.md',
  'packages/react/README.md',
  'packages/remote-drizzle/README.md',
  'packages/remote-server/README.md',
  'packages/remote/README.md',
  'packages/richtext-dom/README.md',
  'packages/richtext-markdown/README.md',
  'packages/richtext/README.md',
  'packages/site/README.md',
  'packages/ssr/README.md',
  'packages/surface/README.md',
  'packages/sync/README.md',
  'skills/foldkit-plus/references/agent.md',
  'skills/foldkit-plus/references/alchemy.md',
  'skills/foldkit-plus/references/auth.md',
  'skills/foldkit-plus/references/bundle.md',
  'skills/foldkit-plus/references/cms.md',
  'skills/foldkit-plus/references/composition.md',
  'skills/foldkit-plus/references/crud.md',
  'skills/foldkit-plus/references/entity.md',
  'skills/foldkit-plus/references/form.md',
  'skills/foldkit-plus/references/guard.md',
  'skills/foldkit-plus/references/mirror.md',
  'skills/foldkit-plus/references/mixins.md',
  'skills/foldkit-plus/references/react.md',
  'skills/foldkit-plus/references/remote.md',
  'skills/foldkit-plus/references/richtext.md',
  'skills/foldkit-plus/references/site.md',
  'skills/foldkit-plus/references/ssr.md',
  'skills/foldkit-plus/references/surface.md',
  'skills/foldkit-plus/references/sync.md',
])

const root = fileURLToPath(new URL('..', import.meta.url))
const posix = path => path.split(sep).join('/')
const check = join(root, 'node_modules', '.docs-check')

const tracked = spawnSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: root, encoding: 'utf8' })
  .stdout.split('\0')
  .filter(
    file =>
      // A package's README, and a subpath's (`foldkit-primitives/dom`).
      /^packages\/[^/]+\/(?:(?!test\/)[^/]+\/)?README\.md$/.test(file) ||
      /^docs\/[^/]+\.md$/.test(file) ||
      file.startsWith('skills/foldkit-plus/'),
  )
const only = process.argv.slice(2).map(file => posix(relative(root, resolve(file))))
const documents = only.length === 0 ? tracked : tracked.filter(file => only.includes(file))
const isPending = document => only.length === 0 && pending.has(document)

/** A document's TypeScript blocks and hidden fixtures, each with the line its code starts on. */
const itemsOf = text => {
  const lines = text.split(/\r?\n/)
  const items = []
  for (let i = 0; i < lines.length; i++) {
    const fixture = /^\s*<!--\s*docs-check\b(.*)$/.exec(lines[i])
    if (fixture !== null) {
      const close = lines.findIndex((line, j) => j >= i && line.includes('-->'))
      const end = close === -1 ? lines.length - 1 : close
      const code = [fixture[1], ...lines.slice(i + 1, end + 1)]
      code[code.length - 1] = code.at(-1).replace(/-->.*$/, '')
      items.push({ line: i + 1, code: code.join('\n'), words: new Set() })
      i = end
      continue
    }
    const open = /^(\s*)(`{3,}|~{3,})\s*(\S*)(.*)$/.exec(lines[i])
    if (open === null) continue
    const [, indent, fence, lang, meta] = open
    const close = lines.findIndex(
      (line, j) => j > i && line.trim().startsWith(fence) && /^(`+|~+)$/.test(line.trim()),
    )
    const end = close === -1 ? lines.length : close
    if (['ts', 'typescript', 'tsx'].includes(lang))
      items.push({
        line: i + 2,
        tsx: lang === 'tsx',
        words: new Set(meta.trim().split(/\s+/)),
        code: lines
          .slice(i + 1, end)
          .map(line => (line.startsWith(indent) ? line.slice(indent.length) : line.trimStart()))
          .join('\n'),
      })
    i = end
  }
  return items
}

// Each workspace package's specifiers, to the source its `foldkit-plus:source`
// condition names, as `scripts/workspace-paths.mjs` maps them.
const packages = []
for (const name of readdirSync(join(root, 'packages'))) {
  const dir = join(root, 'packages', name)
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) continue
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  const specifiers = Object.entries(pkg.exports ?? {})
    .filter(([, entry]) => typeof entry === 'object' && entry?.['foldkit-plus:source'])
    .map(([subpath, entry]) => [
      subpath === '.' ? pkg.name : pkg.name + subpath.slice(1),
      resolve(dir, entry['foldkit-plus:source']),
    ])
  packages.push({ name: pkg.name, dir, specifiers })
}
const ours = new Set(packages.map(pkg => pkg.name))
const packageName = specifier =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]

const importPattern =
  /^import\s+(?:(type)\s+)?(?:([\s\S]*?)\s+from\s+)?(['"])([^'"\n]+)\3;?[^\S\n]*(?:\/\/[^\n]*)?$/gm

/** One import statement per binding, keyed by what it binds, so repeated imports merge. */
const bindingsOf = (typeOnly, clause, specifier) => {
  if (clause === undefined) return [{ key: specifier, text: `import '${specifier}'`, type: false }]
  const bindings = []
  const rest = clause
    .replace(/\{[\s\S]*\}/, '')
    .replace(/,/g, ' ')
    .trim()
  const namespace = /^\*\s+as\s+([\w$]+)$/.exec(rest)
  if (namespace !== null) bindings.push([`* as ${namespace[1]}`, typeOnly])
  else if (rest !== '') bindings.push([rest, typeOnly])
  for (const element of /\{([\s\S]*)\}/.exec(clause)?.[1].split(',') ?? []) {
    const [, elementType, imported, local = imported] =
      /^\s*(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(element) ?? []
    if (imported !== undefined)
      bindings.push([
        `{ ${imported === local ? local : `${imported} as ${local}`} }`,
        typeOnly || elementType !== undefined,
      ])
  }
  return bindings.map(([binding, type]) => ({
    key: `${binding} from '${specifier}'`,
    text: `import ${type ? 'type ' : ''}${binding} from '${specifier}'`,
    type,
  }))
}

rmSync(check, { recursive: true, force: true })
mkdirSync(join(check, 'node_modules'), { recursive: true })

const modules = []
const foreign = new Set()
let blockCount = 0
for (const document of documents) {
  const items = itemsOf(readFileSync(join(root, document), 'utf8')).filter(
    item => !item.words.has('sketch'),
  )
  const groups = []
  for (const item of items)
    if (groups.length === 0 || item.words.has('standalone')) groups.push([item])
    else groups.at(-1).push(item)
  blockCount += items.filter(item => item.tsx !== undefined).length

  groups.forEach((group, index) => {
    // Imports go first, one line per binding; a binding used as a value
    // anywhere is imported as one.
    const imports = new Map()
    const bodies = group.map(item => ({
      item,
      code: item.code.replace(importPattern, (statement, typeOnly, clause, _, specifier, at) => {
        const line = item.line + item.code.slice(0, at).split('\n').length - 1
        for (const binding of bindingsOf(typeOnly, clause, specifier)) {
          const known = imports.get(binding.key)
          if (known === undefined || (known.type && !binding.type))
            imports.set(binding.key, { ...binding, line: known?.line ?? line })
        }
        if (
          /^[^./]/.test(specifier) &&
          !specifier.includes(':') &&
          !ours.has(packageName(specifier))
        )
          foreign.add(packageName(specifier))
        return statement.replace(/[^\n]/g, '')
      }),
    }))
    const lines = [...imports.values()].map(({ text }) => text)
    const origins = [...imports.values()].map(({ line }) => line)
    for (const { item, code } of bodies)
      code.split('\n').forEach((text, i) => {
        lines.push(text)
        origins.push(item.line + i)
      })
    lines.push('export {}')
    origins.push(group.at(-1).line)
    const file = `${document.replace(/[/.]/g, '_')}_${index + 1}.${group.some(item => item.tsx) ? 'tsx' : 'ts'}`
    writeFileSync(join(check, file), `${lines.join('\n')}\n`)
    modules.push({ file, document, origins })
  })
}

// A dependency the root does not install is linked from the first workspace
// project that does, so a block imports it as an application would.
const installers = [
  root,
  ...['packages', 'examples'].flatMap(folder =>
    readdirSync(join(root, folder))
      .map(name => join(root, folder, name))
      .filter(dir => statSync(dir).isDirectory()),
  ),
]
for (const name of foreign) {
  const found = installers.map(dir => join(dir, 'node_modules', name)).find(existsSync)
  if (found === undefined) continue
  mkdirSync(dirname(join(check, 'node_modules', name)), { recursive: true })
  symlinkSync(realpathSync(found), join(check, 'node_modules', name), 'junction')
}

// Two programs: TypeScript reports no type error while any file of a program
// fails to parse, so a pending document must not hide a checked one's.
const projects = [
  ['tsconfig.json', modules.filter(({ document }) => !isPending(document))],
  ['tsconfig.pending.json', modules.filter(({ document }) => isPending(document))],
].filter(([, members]) => members.length > 0)
for (const [name, members] of projects)
  writeFileSync(
    join(check, name),
    JSON.stringify({
      extends: posix(relative(check, join(root, 'tsconfig.base.json'))),
      compilerOptions: {
        noEmit: true,
        jsx: 'preserve',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        paths: Object.fromEntries(
          packages
            .flatMap(pkg => pkg.specifiers)
            .map(([specifier, file]) => [specifier, [posix(relative(check, file))]]),
        ),
      },
      files: members.map(({ file }) => file),
      references: packages
        .filter(pkg => existsSync(join(pkg.dir, 'tsconfig.json')))
        .map(pkg => ({ path: posix(relative(check, pkg.dir)) })),
    }),
  )

const started = Date.now()
const tsc = spawnSync(
  process.execPath,
  [
    join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-b',
    ...projects.map(([name]) => join(check, name)),
    '--pretty',
    'false',
  ],
  { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 },
)
const seconds = ((Date.now() - started) / 1000).toFixed(1)

// Each diagnostic, read back to the Markdown line it is about.
const byFile = new Map(modules.map(module => [module.file, module]))
const diagnostics = []
for (const line of `${tsc.stdout}${tsc.stderr}`.split(/\r?\n/)) {
  const at = /^(.+?)\((\d+),(\d+)\): error (TS(\d+): .*)$/.exec(line)
  if (at === null) {
    if (/^\s/.test(line) && diagnostics.length > 0) diagnostics.at(-1).lines.push(line.trim())
    else if (line.trim() !== '') diagnostics.push({ lines: [line] })
    continue
  }
  const module = byFile.get(posix(relative(check, resolve(root, at[1]))))
  diagnostics.push({
    document: module?.document,
    syntax: Number(at[5]) < 2000,
    lines: [
      module === undefined
        ? `${posix(relative(root, resolve(root, at[1])))}:${at[2]}: ${at[4]}`
        : `${module.document}:${module.origins[Number(at[2]) - 1]}: ${at[4]}`,
    ],
  })
}
// A program that fails to parse reports nothing else, so a pending program
// whose every error is below TS2000 may hide type errors and fails; with a type
// error beside them, they are the checker's grammar errors (a `yield` outside a
// generator, in a block that is a generator's body), which pending excuses.
const ofPending = diagnostics.filter(({ document }) => isPending(document))
const unparsed = ofPending.length > 0 && ofPending.every(({ syntax }) => syntax)
const failures = diagnostics.filter(
  ({ document }) => document === undefined || !isPending(document) || unparsed,
)
const failing = new Set(diagnostics.map(({ document }) => document))
const settled =
  unparsed || only.length > 0
    ? []
    : [...pending].filter(document => !failing.has(document) || !documents.includes(document))

if (failures.length > 0 || settled.length > 0 || (tsc.status !== 0 && diagnostics.length === 0)) {
  console.error(failures.map(({ lines }) => lines.join('\n  ')).join('\n'))
  for (const document of settled)
    console.error(`${document} is pending in scripts/docs-check.mjs, but compiles: remove it`)
  console.error(
    `\ndocs-check: ${failures.length} errors (${seconds}s). Fix the snippet, or mark a mental ` +
      'model ```ts sketch; see scripts/docs-check.mjs.',
  )
  process.exit(1)
}
console.log(
  `docs-check: ${blockCount} blocks in ${documents.length} documents (${pending.size} pending) compile (${seconds}s)`,
)
