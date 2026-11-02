#!/usr/bin/env node
/**
 * Builds an example's browser bundle the way an installed application would get
 * it, and attributes its bytes to packages (#421).
 *
 *   node scripts/bundle-report.mjs examples/foldkit/domains-plus [--json out.json] [--rebuild]
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
const workspaceClosure = exampleDir => {
  const dirOf = new Map()
  for (const dir of readdirSync(join(repo, 'packages'))) {
    const manifest = join(repo, 'packages', dir, 'package.json')
    if (existsSync(manifest)) dirOf.set(readJson(manifest).name, dir)
  }
  const seen = new Set()
  const visit = manifest => {
    const deps = { ...manifest.dependencies, ...manifest.peerDependencies }
    for (const name of Object.keys(deps)) {
      const dir = dirOf.get(name)
      if (dir === undefined || seen.has(dir)) continue
      seen.add(dir)
      visit(readJson(join(repo, 'packages', dir, 'package.json')))
    }
  }
  visit(readJson(join(exampleDir, 'package.json')))
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
  }
}

/**
 * Builds the example's client and returns what it wrote.
 * `dir` is a folder this call owns; it holds `client/` and `server/`.
 */
export const buildClient = async (exampleDirectory, { rebuild = false, server = false } = {}) => {
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
    .filter(plugin => plugin && plugin.name !== BRANDING_PLUGIN)
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

/** The figures: one row per group, brotli estimated from each module's share of its chunk. */
export const reportFor = (client, exampleDir) => {
  const loaded = entryGraph(client)
  const groups = new Map()
  const total = { minified: 0, brotli: 0, chunks: 0, lazyBrotli: 0, lazyChunks: 0 }
  const row = name => {
    let entry = groups.get(name)
    if (entry === undefined) groups.set(name, (entry = { name, minified: 0, brotli: 0 }))
    return entry
  }
  const modulesOf = new Map()
  for (const file of jsFiles(client)) {
    const name = relative(client, file).replaceAll('\\', '/')
    const code = readFileSync(file, 'utf8')
    const brotli = brotliSize(code)
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
    styleSystemBrotli: style,
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

/** Builds the example's client and reports it; the test and the CLI share this. */
export const measure = async (exampleDirectory, options) => {
  const built = await buildClient(exampleDirectory, options)
  try {
    return reportFor(built.client, resolve(exampleDirectory))
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
  const jsonAt = flag('--json')
  const jsonPath = jsonAt === -1 ? undefined : args[jsonAt + 1]
  const target = args.find(
    (arg, index) =>
      !arg.startsWith('--') && args[index - 1] !== '--json' && args[index - 1] !== '--worker',
  )
  if (target === undefined) {
    console.error('usage: node scripts/bundle-report.mjs <example dir> [--json <file>] [--rebuild]')
    process.exit(2)
  }
  const workerAt = flag('--worker')
  if (flag('--server') !== -1 || workerAt !== -1) {
    const report =
      workerAt === -1
        ? await measureServer(target, { rebuild: flag('--rebuild') !== -1 })
        : await measureWorker(target, args[workerAt + 1])
    console.log(formatServerReport(report))
    process.exit(0)
  }
  const report = await measure(target, { rebuild: flag('--rebuild') !== -1 })
  console.log(formatReport(report))
  if (jsonPath !== undefined) {
    mkdirSync(resolve(jsonPath, '..'), { recursive: true })
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  }
}
