#!/usr/bin/env node
/**
 * Builds an example's browser bundle the way an installed application would get
 * it, and attributes its bytes to packages (#421).
 *
 *   node scripts/bundle-report.mjs examples/foldkit/domains-plus [--json out.json] [--rebuild]
 *     [--landing home --route home=src/view.ts --route editor=src/editor.ts]
 *
 * "As an installed application would": workspace packages resolve to their
 * published `dist` (the `foldkit-plus:source` condition is dropped), and
 * Foldkit's `foldkit:view-identity` plugin, which writes each view function's
 * module path into the bundle and skips `node_modules`, is removed. Built in
 * the workspace, it brands a package's `dist` and inflates it.
 *
 * Brotli cannot be measured per module inside a chunk. Each module's share of
 * the chunk's minified bytes (from the source map) is scaled to the chunk's
 * real brotli size, so the figures add up to the real total and the split
 * between packages is an estimate.
 *
 * Per route (`--route`): a route is a module the application names. Its first
 * load is the entry's graph, plus the route's own chunk and that chunk's
 * static imports when the route is split off; "only this" is the brotli of the
 * modules that route's root alone reaches by static import (#438, decision 6).
 * An application that does not split routes has every route in the entry.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const repo = resolve(import.meta.dirname, '..')
const SOURCE_CONDITION = 'foldkit-plus:source'
const BRANDING_PLUGIN = 'foldkit:view-identity'

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))

const brotliSize = text =>
  brotliCompressSync(text, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(text),
    },
  }).length

/** The workspace packages an example depends on, directly or through each other. */
export const workspaceClosure = exampleDir => {
  const dirOf = new Map()
  for (const dir of readdirSync(join(repo, 'packages'))) {
    const manifest = join(repo, 'packages', dir, 'package.json')
    if (existsSync(manifest)) dirOf.set(readJson(manifest).name, dir)
  }
  const seen = new Set()
  const visit = (manifest, own = false) => {
    // An example's own `devDependencies` count: it bundles them, and a package whose `dist` is
    // not built resolves from source instead, so the bytes depended on which other budget had built it.
    const deps = {
      ...(own ? manifest.devDependencies : {}),
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    }
    for (const name of Object.keys(deps)) {
      const dir = dirOf.get(name)
      if (dir === undefined || seen.has(dir)) continue
      seen.add(dir)
      visit(readJson(join(repo, 'packages', dir, 'package.json')))
    }
  }
  visit(readJson(join(exampleDir, 'package.json')), true)
  return [...seen]
}

/** The newest modification time of any file under `dir`, skipping `node_modules`; -Infinity if none. */
export const newestMtime = dir => {
  if (!existsSync(dir)) return -Infinity
  let newest = -Infinity
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') newest = Math.max(newest, newestMtime(path))
    } else {
      newest = Math.max(newest, statSync(path).mtimeMs)
    }
  }
  return newest
}

/**
 * A `dist` is stale when `src/` or `package.json` is newer than its newest file.
 * A missing `dist` is -Infinity, so it is stale too.
 */
export const isStale = packageDir =>
  Math.max(
    newestMtime(join(packageDir, 'src')),
    statSync(join(packageDir, 'package.json')).mtimeMs,
  ) > newestMtime(join(packageDir, 'dist'))

/**
 * Builds the packages the example reaches whose `dist` is missing or stale
 * (CI builds none), or all of them with `rebuild`.
 */
const ensureDist = async (dirs, rebuild) => {
  const { build } = await import('tsdown')
  // Bundle budgets run as parallel processes (CI shards, a wide local run), each finding `dist`
  // missing. A build empties `dist` first, so a second build rewrote the one a reading process was
  // bundling, and tsdown orders a module's imports by which resolved first, so two builds of the
  // same source differ and so did the bundles built from them (351,342 against 351,485 bytes).
  // One build at a time; the rest find it done.
  const release = await lockDist()
  try {
    await buildMissing(dirs, rebuild, build)
  } finally {
    release()
  }
}

const LOCK = join(tmpdir(), 'foldkit-plus-dist.lock')
// Only for a holder that never wrote its pid (killed between `mkdir` and the write).
const LOCK_STALE_MS = 10 * 60_000

const isAlive = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

const isAbandoned = lock => {
  let pid
  try {
    pid = Number(readFileSync(join(lock, 'pid'), 'utf8'))
  } catch {
    return (
      Date.now() - (statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Infinity) > LOCK_STALE_MS
    )
  }
  return !isAlive(pid)
}

/** Takes the lock on `lock`, waiting for a live holder; a holder that died is replaced at once. */
export const lockDist = async (lock = LOCK) => {
  for (;;) {
    try {
      mkdirSync(lock)
      writeFileSync(join(lock, 'pid'), String(process.pid))
      return () => rmSync(lock, { recursive: true, force: true })
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      if (isAbandoned(lock)) rmSync(lock, { recursive: true, force: true })
      await new Promise(done => setTimeout(done, 200))
    }
  }
}

const buildMissing = async (dirs, rebuild, build) => {
  for (const dir of dirs) {
    const packageDir = join(repo, 'packages', dir)
    const manifest = readJson(join(packageDir, 'package.json'))
    const entry = manifest.exports?.['.']?.import
    const built = entry !== undefined && existsSync(join(packageDir, entry))
    const stale = built && isStale(packageDir)
    if (!rebuild && built && !stale) continue
    if (stale) console.error(`rebuilding ${manifest.name}: its dist is older than its source`)
    const config = (await import(pathToFileURL(join(packageDir, 'tsdown.config.ts')).href)).default
    await build({ ...config, config: false, cwd: packageDir, dts: false, logLevel: 'silent' })
    canonicalizeDist(join(packageDir, 'dist'))
  }
}

const IMPORT_LINE = /^(?:import|export \*).* from "[^"]+";$/

/**
 * The text with its leading run of one-line `import … from` and `export * from` statements sorted.
 * Rolldown writes them in the order it happened to finish reading each module, so two builds of one
 * source differ, the bundles an application makes from them differ, and a size budget reading
 * 351,342 bytes once read 351,485 the next time.
 */
export const sortLeadingImports = text => {
  const lines = text.split('\n')
  let end = 0
  while (end < lines.length && IMPORT_LINE.test(lines[end])) end++
  return [...lines.slice(0, end).sort(), ...lines.slice(end)].join('\n')
}

export const canonicalizeDist = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) canonicalizeDist(path)
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      const text = readFileSync(path, 'utf8')
      const sorted = sortLeadingImports(text)
      if (sorted !== text) writeFileSync(path, sorted)
    }
  }
}

const buildPinned = async (exampleDirectory, { rebuild = false, server = false } = {}) => {
  const exampleDir = resolve(exampleDirectory)
  await ensureDist(workspaceClosure(exampleDir), rebuild)

  // The example's own Vite, so its plugins see the version they were built for.
  const vite = await import(
    pathToFileURL(createRequire(join(exampleDir, 'package.json')).resolve('vite')).href
  )
  const loaded = await vite.loadConfigFromFile(
    { command: 'build', mode: 'production' },
    undefined,
    exampleDir,
  )
  if (loaded === null) throw new Error(`no Vite config in ${exampleDir}`)

  const dir = mkdtempSync(join(tmpdir(), 'bundle-report-'))
  const dropSource = resolveOptions => {
    if (resolveOptions?.conditions === undefined) return resolveOptions
    const conditions = resolveOptions.conditions.filter(name => name !== SOURCE_CONDITION)
    // An empty list would replace Vite's defaults (`module`, `browser`, ...) with nothing.
    const { conditions: _, ...rest } = resolveOptions
    return conditions.length === 0 ? rest : { ...rest, conditions }
  }
  const plugins = [loaded.config.plugins ?? []]
    .flat(Infinity)
    // `staticSite` prerenders pages after the build, from a server build this
    // report does not make; it adds nothing to the client's bytes.
    .filter(plugin => plugin && plugin.name !== BRANDING_PLUGIN)
    .filter(plugin => server || plugin.name !== 'foldkit-ssr')
  const config = {
    ...loaded.config,
    root: exampleDir,
    configFile: false,
    logLevel: 'silent',
    resolve: dropSource(loaded.config.resolve),
    ssr: loaded.config.ssr && {
      ...loaded.config.ssr,
      resolve: dropSource(loaded.config.ssr.resolve),
    },
    plugins: [
      ...plugins,
      {
        name: 'bundle-report-graph',
        // The static import graph of the client build, for the per-route figures.
        generateBundle() {
          if (this.environment?.name !== 'client') return
          const graph = {}
          for (const id of this.getModuleIds()) {
            const info = this.getModuleInfo(id)
            if (info === null) continue
            graph[id] = { imports: info.importedIds, entry: info.isEntry }
          }
          writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph))
        },
      },
      {
        name: 'bundle-report',
        // After the Foldkit plugin has set its own output folders.
        configEnvironment: {
          order: 'post',
          handler: name => ({
            build: {
              outDir: join(dir, name === 'ssr' ? 'server' : name),
              emptyOutDir: true,
              ...(name === 'client' ? { sourcemap: true, manifest: true } : {}),
              ...(name === 'ssr' && server ? { sourcemap: true } : {}),
            },
          }),
        },
      },
    ],
  }
  // Vitest sets NODE_ENV to `test`, which Vite then compiles into the bundle
  // (dev-only branches kept: 219 kB where a production build is 210).
  const nodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const builder = await vite.createBuilder(config)
    await builder.build(builder.environments.client)
    if (server) await builder.build(builder.environments.ssr)
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
  }
  return {
    dir,
    client: join(dir, 'client'),
    server: join(dir, 'server'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/** A UUID's length, so a reading stays comparable with one taken from a random id. */
const MEASURED_BUILD_ID = '00000000-0000-4000-8000-000000000000'

/**
 * Builds the example's client and returns what it wrote.
 * `dir` is a folder this call owns; it holds `client/` and `server/`.
 */
export const buildClient = async (exampleDirectory, options) => {
  // A build id is random unless given, and compiled into the bundle: pinned
  // from before the config reads it, the same source measures the same bytes (#490).
  const buildId = process.env.FOLDKIT_BUILD_ID
  process.env.FOLDKIT_BUILD_ID = MEASURED_BUILD_ID
  try {
    return await buildPinned(exampleDirectory, options)
  } finally {
    if (buildId === undefined) delete process.env.FOLDKIT_BUILD_ID
    else process.env.FOLDKIT_BUILD_ID = buildId
  }
}

const jsFiles = folder => {
  const found = []
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.js')) found.push(path)
    }
  }
  walk(folder)
  return found
}

/** The chunks the entry loads by static import (what a page pays before any lazy chunk). */
const entryGraph = client => {
  const manifestPath = join(client, '.vite', 'manifest.json')
  if (!existsSync(manifestPath)) return null
  const manifest = readJson(manifestPath)
  const seen = new Set()
  const visit = key => {
    const chunk = manifest[key]
    if (chunk === undefined || seen.has(chunk.file)) return
    seen.add(chunk.file)
    for (const next of chunk.imports ?? []) visit(next)
  }
  for (const [key, chunk] of Object.entries(manifest)) if (chunk.isEntry) visit(key)
  return seen
}

// A module's package, and for a workspace package which of its modules.
const packageOf = source => {
  const path = source.replaceAll('\\', '/')
  const nodeModules = path.lastIndexOf('node_modules/')
  if (nodeModules !== -1) {
    const parts = path.slice(nodeModules + 'node_modules/'.length).split('/')
    const depth = parts[0].startsWith('@') ? 2 : 1
    return {
      name: parts.slice(0, depth).join('/'),
      file: parts
        .slice(depth)
        .join('/')
        .replace(/^(dist|src)\//, ''),
    }
  }
  const workspace = /(?:^|\/)packages\/([^/]+)\/(?:dist|src)\/(.+)$/.exec(path)
  if (workspace !== null) {
    const manifest = join(repo, 'packages', workspace[1], 'package.json')
    return {
      name: existsSync(manifest) ? readJson(manifest).name : workspace[1],
      file: workspace[2],
    }
  }
  return { name: '(app)', file: relative(repo, path).replaceAll(String.fromCharCode(92), '/') }
}

// Style system modules of foldkit-mixins, by dist or src file (without extension).
// Runtime: compile, hash, inject and the theme builder. Data: what they are fed.
const STYLE_RUNTIME = new Set([
  'style',
  'styleRules',
  'styleValue',
  'inject',
  'cssBlocks',
  'selector',
  'layers',
  'theme',
  'theme/core',
  'theme/knob',
  'theme/knobs',
  'theme/knobsKept',
  'theme/oklch',
  'theme/gamut',
  'theme/cssMath',
  'theme/fluid',
  'theme/root',
  'theme/scheme',
  'theme/raise',
  'theme/scriptLiteral',
  'theme/themes',
])
const STYLE_DATA = new Set([
  'defaults',
  'utilities',
  'layout',
  'prose',
  'theme/tokens',
  'theme/shadows',
  'theme/fonts',
  'theme/iconMasks',
])

const groupOf = ({ name, file }) => {
  if (name === 'foldkit-mixins') {
    const stem = file.replace(/\.(js|ts)$/, '')
    if (STYLE_RUNTIME.has(stem)) return 'foldkit-mixins: style runtime'
    if (STYLE_DATA.has(stem)) return 'foldkit-mixins: style data'
    return 'foldkit-mixins: other'
  }
  if (name === 'foldkit' && /devtools/i.test(file)) return 'foldkit: devtools'
  if (name === '(app)') return '(app) src'
  if (name.startsWith('@floating-ui/')) return '@floating-ui/*'
  if (
    name === 'foldkit' ||
    name === 'effect' ||
    name.startsWith('@foldkit/') ||
    name.startsWith('foldkit-')
  )
    return name
  return 'other node_modules'
}

// --- source maps ---------------------------------------------------------

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const decodeLine = line => {
  const segments = []
  let value = 0
  let shift = 0
  let fields = []
  const flush = () => {
    if (fields.length > 0) segments.push(fields)
    fields = []
  }
  for (const char of line) {
    if (char === ',') {
      flush()
      continue
    }
    const digit = BASE64.indexOf(char)
    value += (digit & 31) << shift
    if (digit & 32) {
      shift += 5
    } else {
      fields.push(value & 1 ? -(value >> 1) : value >> 1)
      value = 0
      shift = 0
    }
  }
  flush()
  return segments
}

/** Generated characters per source file, by walking each segment to the next one's start. */
const attribute = (code, map) => {
  const lines = code.split('\n')
  const bySource = new Map()
  const add = (source, length) => {
    if (length > 0) bySource.set(source, (bySource.get(source) ?? 0) + length)
  }
  let source = 0
  for (const [row, mapped] of map.mappings.split(';').entries()) {
    const segments = decodeLine(mapped)
    const lineLength = lines[row]?.length ?? 0
    let column = 0
    let previous = null
    for (const fields of segments) {
      column += fields[0]
      if (fields.length >= 4) source += fields[1]
      if (previous !== null) add(previous.source, column - previous.column)
      else if (column > 0) add('(unmapped)', column)
      previous = { column, source: fields.length >= 4 ? map.sources[source] : '(unmapped)' }
    }
    if (previous === null) add('(unmapped)', lineLength)
    else add(previous.source, lineLength - previous.column)
  }
  return bySource
}

// A module's identity across its `dist` and `src` spellings.
const moduleKey = id => {
  const { name, file } = packageOf(id)
  return `${name}/${file}`.replace(/\.(?:m|c)?[jt]sx?$/, '')
}

/** Each module's share of a chunk's bytes, by `moduleKey`, from its source map. */
const shares = (file, code) => {
  const mapFile = `${file}.map`
  const map = existsSync(mapFile) ? readJson(mapFile) : null
  const bySource = map === null ? new Map() : attribute(code, map)
  const sum = [...bySource.values()].reduce((a, b) => a + b, 0)
  const found = new Map()
  for (const [source, chars] of bySource) {
    if (source === '(unmapped)') continue
    const key = moduleKey(resolve(dirname(file), source))
    found.set(key, (found.get(key) ?? 0) + chars / sum)
  }
  return found
}

const normalize = id => id.replaceAll(String.fromCharCode(92), '/').replace(/[?#].*$/, '')

/**
 * The modules that exactly one route root reaches by static imports. Reached
 * from the entry without passing a route root, or from two roots, a module is
 * shared and belongs to no route. `graph` maps a module id to its `imports`.
 */
export const exclusiveModules = (graph, entries, roots) => {
  const reach = (starts, barriers) => {
    const seen = new Set()
    const visit = id => {
      if (seen.has(id) || barriers.has(id)) return
      seen.add(id)
      for (const next of graph[id]?.imports ?? []) visit(next)
    }
    for (const start of starts) visit(start)
    return seen
  }
  const all = new Set([...roots.values()].flat())
  const base = reach(entries, all)
  const by = new Map(
    [...roots].map(([name, own]) => [
      name,
      reach(own, new Set([...all].filter(id => !own.includes(id)))),
    ]),
  )
  const result = new Map()
  for (const [name, reached] of by) {
    const own = [...reached].filter(
      id => !base.has(id) && [...by].every(([other, set]) => other === name || !set.has(id)),
    )
    result.set(name, own)
  }
  return result
}

const routeFigures = (client, routes, chunks, loaded, entryBrotli) => {
  const graphPath = join(client, '..', 'graph.json')
  if (!existsSync(graphPath))
    throw new Error('no module graph beside the build; build it with measure')
  const graph = Object.fromEntries(
    Object.entries(readJson(graphPath)).map(([id, edges]) => [
      normalize(id),
      { imports: edges.imports.map(normalize), entry: edges.entry },
    ]),
  )
  const ids = Object.keys(graph)
  const rootOf = new Map(
    routes.map(route => {
      const found = route.module.split(',').map(suffix => {
        const hits = ids.filter(id => id.endsWith(`/${suffix}`) || id === suffix)
        if (hits.length !== 1)
          throw new Error(`route ${route.name}: ${hits.length} modules end with ${suffix}`)
        return hits[0]
      })
      return [route.name, found]
    }),
  )
  const entries = ids.filter(id => graph[id].entry)
  const own = exclusiveModules(graph, entries, rootOf)
  const manifestPath = join(client, '.vite', 'manifest.json')
  const manifestByKey = existsSync(manifestPath) ? readJson(manifestPath) : {}
  const manifestByFile = new Map(Object.values(manifestByKey).map(chunk => [chunk.file, chunk]))
  return routes.map(route => {
    const rootKeys = rootOf.get(route.name).map(moduleKey)
    const holder = [...chunks].find(([, chunk]) => rootKeys.some(key => chunk.modules.has(key)))
    if (holder === undefined) throw new Error(`route ${route.name}: ${route.module} is in no chunk`)
    const split = loaded !== null && !loaded.has(holder[0])
    // A route in its own chunk also pays for that chunk's static imports not already loaded.
    const extra = new Set()
    if (split) {
      const visit = file => {
        if (file === undefined || loaded.has(file) || extra.has(file)) return
        extra.add(file)
        const entry = manifestByFile.get(file)
        for (const next of entry?.imports ?? []) visit(manifestByKey[next]?.file)
      }
      visit(holder[0])
    }
    const keys = new Set(own.get(route.name).map(moduleKey))
    let alone = 0
    for (const [, chunk] of chunks)
      for (const [key, share] of chunk.modules) if (keys.has(key)) alone += chunk.brotli * share
    return {
      name: route.name,
      module: route.module,
      landing: route.landing === true,
      split,
      firstLoadBrotli:
        entryBrotli + [...extra].reduce((sum, file) => sum + chunks.get(file).brotli, 0),
      aloneBrotli: Math.round(alone),
      aloneModules: [...keys].sort(),
    }
  })
}

/** The figures: one row per group, brotli estimated from each module's share of its chunk. */
export const reportFor = (client, exampleDir, routes = []) => {
  const loaded = entryGraph(client)
  const groups = new Map()
  const total = { minified: 0, brotli: 0, chunks: 0, lazyBrotli: 0, lazyChunks: 0 }
  const row = name => {
    let entry = groups.get(name)
    if (entry === undefined) groups.set(name, (entry = { name, minified: 0, brotli: 0 }))
    return entry
  }
  const modulesOf = new Map()
  // Every chunk's brotli and modules, lazy or not, for the per-route figures.
  const chunks = new Map()
  for (const file of jsFiles(client)) {
    const name = relative(client, file).replaceAll('\\', '/')
    const code = readFileSync(file, 'utf8')
    const brotli = brotliSize(code)
    if (routes.length > 0) chunks.set(name, { brotli, modules: shares(file, code) })
    if (loaded !== null && !loaded.has(name)) {
      total.lazyBrotli += brotli
      total.lazyChunks++
      continue
    }
    total.minified += Buffer.byteLength(code)
    total.brotli += brotli
    total.chunks++
    const mapFile = `${file}.map`
    const map = existsSync(mapFile) ? readJson(mapFile) : null
    const bySource = map === null ? new Map([['(unmapped)', code.length]]) : attribute(code, map)
    const sum = [...bySource.values()].reduce((a, b) => a + b, 0)
    for (const [source, chars] of bySource) {
      const share = chars / sum
      const id =
        source === '(unmapped)'
          ? { name: '(unmapped)', file: '' }
          : packageOf(resolve(dirname(file), source))
      const entry = row(source === '(unmapped)' ? '(unmapped)' : groupOf(id))
      entry.minified += Math.round(Buffer.byteLength(code) * share)
      entry.brotli += brotli * share
      const key = `${id.name}/${id.file}`
      const module = modulesOf.get(key) ?? { module: key, minified: 0, brotli: 0 }
      module.minified += Math.round(Buffer.byteLength(code) * share)
      module.brotli += brotli * share
      modulesOf.set(key, module)
    }
  }
  const rows = [...groups.values()]
    .map(entry => ({ ...entry, brotli: Math.round(entry.brotli) }))
    .sort((a, b) => b.brotli - a.brotli)
  const modules = [...modulesOf.values()]
    .map(entry => ({ ...entry, brotli: Math.round(entry.brotli) }))
    .sort((a, b) => b.brotli - a.brotli)
  const style = rows
    .filter(entry => /^foldkit-mixins: style|^foldkit-mixins-ui$/.test(entry.name))
    .reduce((sum, entry) => sum + entry.brotli, 0)
  return {
    example: relative(repo, exampleDir).replaceAll('\\', '/'),
    total,
    rows,
    modules: modules.slice(0, 25),
    /** Every module loaded at start, by name, however small: what a test asks is in it. */
    included: modules.map(entry => entry.module),
    /** Each loaded module's minified bytes, for naming what differs between two builds. */
    sizes: Object.fromEntries(modules.map(entry => [entry.module, entry.minified])),
    styleSystemBrotli: style,
    ...(routes.length > 0
      ? { routes: routeFigures(client, routes, chunks, loaded, total.brotli) }
      : {}),
  }
}

const kb = bytes => `${(bytes / 1000).toFixed(1)} kB`

export const formatReport = report => {
  const { total, rows } = report
  const width = Math.max(...rows.map(entry => entry.name.length), 5)
  const line = (name, minified, brotli) =>
    `${name.padEnd(width)}  ${kb(minified).padStart(10)}  ${kb(brotli).padStart(10)}  ${(
      (brotli / total.brotli) *
      100
    )
      .toFixed(1)
      .padStart(5)}%`
  return [
    `${report.example}: ${total.chunks} chunk(s) loaded at start, ${kb(total.brotli)} brotli, ${kb(total.minified)} minified` +
      (total.lazyChunks > 0
        ? `; ${total.lazyChunks} lazy chunk(s), ${kb(total.lazyBrotli)} brotli, not counted`
        : ''),
    "Brotli per package is estimated: each module's share of its chunk's minified bytes (from the source map) times the chunk's real brotli size. The total is real.",
    '',
    `${'package'.padEnd(width)}  ${'minified'.padStart(10)}  ${'brotli~'.padStart(10)}  ${'share'.padStart(6)}`,
    ...rows.map(entry => line(entry.name, entry.minified, entry.brotli)),
    '',
    `style system (foldkit-mixins style runtime + data, foldkit-mixins-ui): ${kb(report.styleSystemBrotli)} brotli~`,
  ].join('\n')
}

/** Decision 6's bar: brotli that one non-landing route alone imports. */
export const SPLIT_THRESHOLD = 20_000

/** The per-route table, and decision 6's number: the largest `aloneBrotli` of a non-landing route. */
export const formatRoutes = report => {
  const routes = report.routes ?? []
  const width = Math.max(...routes.map(route => route.name.length), 5)
  const largest = routes
    .filter(route => !route.landing)
    .reduce((best, route) => (route.aloneBrotli > best.aloneBrotli ? route : best), {
      name: '(none)',
      aloneBrotli: 0,
    })
  return [
    `${'route'.padEnd(width)}  ${'first load'.padStart(11)}  ${'only this'.padStart(10)}  chunk`,
    ...routes.map(
      route =>
        `${(route.name + (route.landing ? '*' : '')).padEnd(width)}  ${kb(route.firstLoadBrotli).padStart(11)}  ${kb(route.aloneBrotli).padStart(10)}  ${route.split ? 'its own' : 'in the entry'}`,
    ),
    '* landing route. "only this": brotli~ of modules that this route root alone reaches by static imports (shared modules and the entry\'s own are in none).',
    `decision 6: largest non-landing ${kb(largest.aloneBrotli)} (${largest.name}), bar ${kb(SPLIT_THRESHOLD)}: ${largest.aloneBrotli >= SPLIT_THRESHOLD ? 'C1 to C3 due' : 'below the bar'}`,
  ].join('\n')
}

/**
 * What differs between two builds of one source: the modules whose minified bytes differ, and the
 * first differing region of each chunk (`dumpA`, `dumpB` are the `dump` folders of the two builds).
 */
export const explainDifference = (a, b, dumpA, dumpB) => {
  const lines = [`brotli ${a.total.brotli} against ${b.total.brotli}`]
  const names = [...new Set([...Object.keys(a.sizes), ...Object.keys(b.sizes)])].sort()
  const moved = names.filter(name => a.sizes[name] !== b.sizes[name])
  lines.push(
    `modules whose minified bytes differ: ${moved.length}`,
    ...moved.map(
      name => `  ${name}: ${a.sizes[name] ?? 'absent'} against ${b.sizes[name] ?? 'absent'}`,
    ),
  )
  const files = jsFiles(dumpA)
    .map(file => relative(dumpA, file))
    .sort()
  const others = jsFiles(dumpB)
    .map(file => relative(dumpB, file))
    .sort()
  if (files.join() !== others.join())
    lines.push(`chunk files: ${files.join()} against ${others.join()}`)
  for (const file of files.filter(name => others.includes(name))) {
    const x = readFileSync(join(dumpA, file), 'utf8')
    const y = readFileSync(join(dumpB, file), 'utf8')
    if (x === y) continue
    let at = 0
    while (at < x.length && x[at] === y[at]) at++
    lines.push(
      `${file} first differs at character ${at} (${x.length} against ${y.length} characters):`,
      `  first:  ${JSON.stringify(x.slice(Math.max(0, at - 80), at + 240))}`,
      `  second: ${JSON.stringify(y.slice(Math.max(0, at - 80), at + 240))}`,
    )
  }
  return lines.join('\n')
}

/** Builds the example's client and reports it; the test and the CLI share this. */
export const measure = async (exampleDirectory, options) => {
  const built = await buildClient(exampleDirectory, options)
  try {
    if (options?.dump !== undefined) cpSync(built.client, options.dump, { recursive: true })
    return reportFor(built.client, resolve(exampleDirectory), options?.routes)
  } finally {
    built.cleanup()
  }
}

/**
 * A server bundle: one file with a source map, by package (#416). A Worker is
 * uploaded whole and its isolate evaluates all of it, so the figures are raw
 * bytes, and gzip, which is what the upload is measured in.
 */
export const reportServerFile = (file, label) => {
  const code = readFileSync(file, 'utf8')
  const mapFile = `${file}.map`
  const map = existsSync(mapFile) ? readJson(mapFile) : null
  const bySource = map === null ? new Map([['(unmapped)', code.length]]) : attribute(code, map)
  const sum = [...bySource.values()].reduce((a, b) => a + b, 0)
  const bytes = Buffer.byteLength(code)
  const groups = new Map()
  const modules = new Map()
  for (const [source, chars] of bySource) {
    const share = Math.round(bytes * (chars / sum))
    const id =
      source === '(unmapped)'
        ? { name: '(unmapped)', file: '' }
        : packageOf(resolve(dirname(file), source))
    const grouped = source === '(unmapped)' ? '(unmapped)' : groupOf(id)
    // A server's libraries are named: the client's lump is too coarse to cut by.
    const name = grouped === 'other node_modules' ? id.name : grouped
    groups.set(name, (groups.get(name) ?? 0) + share)
    const key = `${id.name}/${id.file}`
    modules.set(key, (modules.get(key) ?? 0) + share)
  }
  const ranked = entries =>
    [...entries].map(([name, size]) => ({ name, bytes: size })).sort((a, b) => b.bytes - a.bytes)
  return {
    example: label,
    bytes,
    gzip: gzipSync(code, { level: 9 }).length,
    rows: ranked(groups),
    modules: ranked(modules).slice(0, 80),
    files: [...modules.keys()],
  }
}

export const formatServerReport = report => {
  const width = Math.max(...report.rows.map(entry => entry.name.length), 7)
  return [
    `${report.example}: ${kb(report.bytes)} raw, ${kb(report.gzip)} gzip`,
    '',
    ...report.rows.map(
      entry =>
        `${entry.name.padEnd(width)}  ${kb(entry.bytes).padStart(10)}  ${((entry.bytes / report.bytes) * 100).toFixed(1).padStart(5)}%`,
    ),
    '',
    'largest modules:',
    ...report.modules
      .slice(0, Number(process.env.MODULES ?? 15))
      .map(entry => `  ${entry.name.padEnd(60)} ${kb(entry.bytes)}`),
  ].join(String.fromCharCode(10))
}

/**
 * Bundles a server entry the way `wrangler deploy` does (esbuild, Workers
 * conditions) with a source map, and reports it. Vite's server build leaves
 * node_modules external, so its own file is only what Wrangler starts from.
 */
export const measureWorker = async (exampleDirectory, entry) => {
  const exampleDir = resolve(exampleDirectory)
  await ensureDist(workspaceClosure(exampleDir), false)
  const esbuild = await import(
    pathToFileURL(createRequire(join(exampleDir, 'package.json')).resolve('esbuild')).href
  )
  const dir = mkdtempSync(join(tmpdir(), 'bundle-report-'))
  try {
    await esbuild.build({
      entryPoints: [resolve(exampleDir, entry)],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      conditions: ['workerd', 'worker', 'browser'],
      nodePaths: [join(exampleDir, 'node_modules')],
      external: ['cloudflare:workers', 'node:*'],
      loader: { '.wasm': 'copy' },
      sourcemap: 'external',
      outfile: join(dir, 'worker.js'),
      logLevel: 'silent',
    })
    return reportServerFile(
      join(dir, 'worker.js'),
      relative(repo, exampleDir).replaceAll(String.fromCharCode(92), '/'),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** An example whose Vite build makes the Worker (`dist/server/fetch.js`): built, then bundled. */
export const measureServer = async (exampleDirectory, options) => {
  const built = await buildClient(exampleDirectory, { ...options, server: true })
  // Beside the example, so its bare imports resolve as Wrangler's would.
  const beside = join(resolve(exampleDirectory), `.bundle-report-${process.pid}`)
  try {
    cpSync(built.server, beside, { recursive: true })
    return await measureWorker(exampleDirectory, join(beside, 'fetch.js'))
  } finally {
    rmSync(beside, { recursive: true, force: true })
    built.cleanup()
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2)
  const flag = name => args.indexOf(name)
  const valueOf = name => (flag(name) === -1 ? undefined : args[flag(name) + 1])
  const jsonPath = valueOf('--json')
  const target = args.find(
    (arg, index) =>
      !arg.startsWith('--') &&
      !['--json', '--worker', '--route', '--landing', '--dump'].includes(args[index - 1]),
  )
  if (target === undefined) {
    console.error(
      'usage: node scripts/bundle-report.mjs <example dir> [--json <file>] [--rebuild] [--dump <dir>]\n' +
        '  [--route name=path/suffix.ts ... [--landing name]] [--server | --worker <entry>]',
    )
    process.exit(2)
  }
  const writeJson = report => {
    if (jsonPath === undefined) return
    mkdirSync(resolve(jsonPath, '..'), { recursive: true })
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  }
  const workerEntry = valueOf('--worker')
  if (flag('--server') !== -1 || workerEntry !== undefined) {
    const report =
      workerEntry === undefined
        ? await measureServer(target, { rebuild: flag('--rebuild') !== -1 })
        : await measureWorker(target, workerEntry)
    console.log(formatServerReport(report))
    writeJson(report)
    process.exit(0)
  }
  // `--route name=path/suffix.ts` per route root; `--landing name` marks the landing route.
  const landing = valueOf('--landing')
  const routes = args.flatMap((arg, index) => {
    if (args[index - 1] !== '--route') return []
    const [name, module] = arg.split('=')
    return [{ name, module, landing: name === landing }]
  })
  const dump = valueOf('--dump')
  const report = await measure(target, {
    rebuild: flag('--rebuild') !== -1,
    routes,
    dump: dump === undefined ? undefined : resolve(dump),
  })
  console.log(formatReport(report))
  if (routes.length > 0) console.log(`\n${formatRoutes(report)}`)
  writeJson(report)
}
