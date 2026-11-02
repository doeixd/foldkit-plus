/**
 * `foldkit-plus/testing/workers`: a Worker on a local workerd, configured by
 * its own Wrangler configuration.
 *
 * Wrangler's test harness reads the configuration, so bindings, the
 * compatibility date and flags, `.dev.vars` and D1 migrations mean here what
 * they mean to `wrangler deploy`. This module owns only what Wrangler cannot
 * know: the bundle. esbuild builds the entry with the workspace's source
 * condition into a directory of the stack's own, and the harness runs the
 * configuration with `main` pointed there.
 *
 * `wrangler`, `esbuild` and `@foldkit/vite-plugin` are optional peers of
 * `foldkit-plus`, loaded on the first call; Miniflare is read from Wrangler's
 * own copy, so the date check asks the runtime Wrangler starts.
 */
import { Option, Schema } from 'effect'
import type {
  BuildContext,
  BuildOptions,
  Loader,
  OnLoadArgs,
  OnLoadResult,
  OutputFile,
  Plugin,
} from 'esbuild'
import type { TestHarness, WorkerHandle } from 'wrangler'
import { ChildProcess, spawn } from 'node:child_process'
import { subscribe, unsubscribe } from 'node:diagnostics_channel'
import { readFileSync, watch as watchFile, type FSWatcher } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { peer } from './peer.js'

const SUBPATH = 'testing/workers'

const wrangler = () => peer(SUBPATH, 'wrangler', () => import('wrangler'))
const esbuild = () => peer(SUBPATH, 'esbuild', () => import('esbuild'))
const foldkitVite = () =>
  peer(SUBPATH, '@foldkit/vite-plugin', () => import('@foldkit/vite-plugin'))

export interface StackOptions {
  /** The Worker's Wrangler configuration (`wrangler.toml`, `.json` or `.jsonc`). */
  readonly wrangler: string
  /** The source esbuild bundles into what `main` names. */
  readonly entry: string
  /**
   * Local values for vars the deployed Worker is given elsewhere. As a
   * function, of the origin the stack answers at: the Worker has them from
   * its first request (`origin => ({ ORIGIN: origin })`).
   */
  readonly vars?: Vars | ((origin: string) => Vars)
  /** Local values for secrets, over any in `.dev.vars`. */
  readonly secrets?: Readonly<Record<string, string>>
  /**
   * esbuild plugins for the bundle, the deploy's and the stack's alike. A
   * module one loads is branded with view identities as one read from disk is.
   */
  readonly plugins?: ReadonlyArray<Plugin>
  /**
   * The Vite root of the page the Worker renders; by default the folder of
   * the Wrangler configuration. Each view is named by its module's path from
   * here, as `@foldkit/vite-plugin` names the page's.
   */
  readonly pageRoot?: string
  /**
   * Whether each line the Worker writes to its console is printed here, by
   * its level, as it arrives (`'print'`, the default). `logs()` keeps them either way.
   */
  readonly console?: 'print' | 'quiet'
}

type Vars = Readonly<Record<string, string>>

/** A line the Worker wrote to its console. An `Error` logged carries its stack in `message`. */
export interface WorkerLog {
  /** As workerd names it: `debug`, `info`, `log`, `warn` or `error`. */
  readonly level: string
  readonly message: string
  readonly timestamp: number
}

/**
 * What a watched stack reports after each change to the bundle's sources or
 * to the Wrangler configuration.
 */
export interface WatchListener {
  /** The new Worker answers at the same origin, over the same storage. */
  readonly onSwap: () => void
  /**
   * The change was not swapped in, and the Worker running keeps answering
   * over the same storage. It did not build, built no code (as an entry saved
   * in place reads for a moment), did not start when tried on a workerd of
   * its own, or is a configuration the stack refuses. Or it was swapped in,
   * and a D1 migration then failed on the running database; the message says so.
   */
  readonly onRefused: (message: string) => void
  /**
   * A Worker that started when tried did not start in the stack. Wrangler's
   * harness tears its runtime down with it, storage included, so the stack
   * has stopped answering and watches no more: call `stop`, and start again.
   */
  readonly onStopped: (message: string) => void
}

export interface Stack<Env> {
  /** Where the Worker answers over real HTTP. */
  readonly origin: string
  /**
   * The Worker's bindings, as the Worker sees them. A swap retires the ones
   * read before it (Miniflare's "poisoned stub"), so read them after.
   */
  readonly env: () => Promise<Env>
  /** A request straight to the Worker; an upgrade answers with its socket. */
  readonly dispatch: WorkerHandle['fetch']
  /**
   * Takes what the Worker wrote to its console since the last call, oldest
   * first. The lines come from workerd beside the response, not on it, so a
   * line written for a request may arrive after it: poll.
   */
  readonly logs: () => ReadonlyArray<WorkerLog>
  /**
   * Requests sent straight to the Worker, metered for `Cpu.budget` by how
   * long workerd's main thread runs, read from the operating system since
   * workerd reports no CPU (Linux and Windows). That counts the Worker's code
   * and what workerd does on the thread around it, D1's SQLite included,
   * which a deployed Worker's CPU time leaves out.
   */
  readonly cpu: CpuMeter
  /**
   * Rebuilds on every change to a file the bundle read, and rereads the
   * Wrangler configuration when it changes. Each change is first started on
   * a workerd of its own, then swapped in at the same origin, and the D1
   * migrations not yet applied are applied. D1, R2 and Durable Object storage stay.
   */
  readonly watch: (listener: WatchListener) => Promise<void>
  /**
   * Stops watching, stops workerd and removes the bundle's directory, each
   * even when one before it failed. A change not yet being tried swaps
   * nothing and reports nothing; one being tried finishes first. A second
   * call returns the first one's promise.
   */
  readonly stop: () => Promise<void>
}

/** What a meter answers: a `Response`, or Miniflare's own. */
export type CpuAnswer = Pick<Response, 'status' | 'arrayBuffer'>

/** Answers requests, and reads how much CPU time the code answering them has spent. */
export interface CpuMeter {
  /** What a route given as a path is resolved against. */
  readonly origin: string
  readonly fetch: (request: Request) => Promise<CpuAnswer>
  /** Milliseconds of CPU time spent so far, from a fixed point of the meter's own. */
  readonly spent: () => Promise<number>
}

/**
 * A route `Cpu.budget` asks: a path or URL to `GET`, or a function making
 * a new request for each run, since a request's body is read once.
 */
export type CpuRoute = string | (() => Request)

/** What one route cost, in milliseconds of CPU time. */
export interface CpuReading {
  readonly route: string
  /** The last response's status. */
  readonly status: number
  /** The route's first request in this call: in a fresh stack, a cold isolate's. */
  readonly cold: number
  /** The mean of the requests after the first. */
  readonly warm: number
}

export interface CpuBudget {
  /** The routes, by the name a failure reports them with. */
  readonly routes: Readonly<Record<string, CpuRoute>>
  /** Milliseconds a warm request may spend. */
  readonly warm: number
  /** Milliseconds the first request may spend; unchecked when not given. */
  readonly cold?: number
  /** Requests after the first, each answered in full before the next; default 5. */
  readonly runs?: number
}

/** The processes spawned while a stack's harness starts or reloads; workerd among them. */
interface Spawned {
  readonly processes: Array<ChildProcess>
  /** Another stack spawned at the same time, so whose process is whose is unknown. */
  shared: boolean
}

const collecting = new Set<Spawned>()

// Named once spawned: Node publishes a process before it starts it.
const isWorkerd = (child: ChildProcess) =>
  typeof child.spawnfile === 'string' && /^workerd(\.exe)?$/.test(basename(child.spawnfile))

// Node publishes every `spawn` here, workerd's by Miniflare included; the
// harness offers no other way to find the process.
const onSpawn = (message: unknown) => {
  if (typeof message !== 'object' || message === null || !('process' in message)) return
  const child = message.process
  if (!(child instanceof ChildProcess)) return
  for (const spawned of collecting) spawned.processes.push(child)
}

/** Runs `step`, adding the processes it spawns to `into`. */
const collect = async <A>(into: Spawned, step: () => Promise<A>): Promise<A> => {
  if (collecting.size === 0) subscribe('child_process', onSpawn)
  for (const other of collecting) other.shared = into.shared = true
  collecting.add(into)
  try {
    return await step()
  } finally {
    collecting.delete(into)
    if (collecting.size === 0) unsubscribe('child_process', onSpawn)
  }
}

const isRunning = (child: ChildProcess) => child.exitCode === null && child.signalCode === null

/** Milliseconds a Linux process's main thread has run, by the scheduler's nanoseconds. */
const linuxTime = async (pid: number): Promise<number> =>
  Number((await readFile(`/proc/${pid}/task/${pid}/schedstat`, 'utf8')).split(' ')[0]) / 1e6

/**
 * Reads how long processes' main threads have run, where workerd runs
 * JavaScript. V8's helper threads, which collect garbage and compile beside
 * it, are left out: on a server-rendered page they added half as much again.
 */
interface CpuReader {
  readonly read: (pids: ReadonlyArray<number>) => Promise<number>
  readonly close: () => void
}

const linuxReader = (): CpuReader => ({
  read: async pids => (await Promise.all(pids.map(linuxTime))).reduce((a, b) => a + b, 0),
  close: () => {},
})

/**
 * Windows has no `/proc`, and Node no call for another process's times, so
 * one PowerShell kept open answers each read: started per read, it takes
 * longer than the requests it measures. The main thread is the one that
 * started first. Windows adds to a thread's time a scheduler tick (15.6 ms)
 * at a time.
 */
const windowsReader = (): CpuReader => {
  const shell = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  })
  const waiting: Array<(line: Option.Option<string>) => void> = []
  createInterface({ input: shell.stdout }).on('line', line => waiting.shift()?.(Option.some(line)))
  // A shell that could not start, or ended, answers no read waiting on it.
  const ended = () => waiting.splice(0).forEach(answer => answer(Option.none()))
  shell.on('error', ended).on('exit', ended)
  return {
    read: pids =>
      new Promise((resolve, reject) => {
        waiting.push(line => {
          const ticks = Number(Option.getOrElse(line, () => ''))
          if (Option.isSome(line) && Number.isFinite(ticks)) resolve(ticks / 1e4)
          else
            reject(
              new Error(
                `workerd's CPU time could not be read: ${Option.getOrElse(line, () => 'PowerShell ended')}`,
              ),
            )
        })
        shell.stdin.write(
          `try { (@(${pids.join(',')}) | % { ([Diagnostics.Process]::GetProcessById($_).Threads | Sort-Object StartTime | Select-Object -First 1).TotalProcessorTime.Ticks } | Measure-Object -Sum).Sum } catch { "$_" }\n`,
        )
      }),
    close: () => shell.kill(),
  }
}

const readerFor = (): CpuReader => {
  if (process.platform === 'linux') return linuxReader()
  if (process.platform === 'win32') return windowsReader()
  throw new Error(
    `The stack reads workerd's CPU time on Linux and Windows, not ${process.platform}.`,
  )
}

/** The CPU meter over a stack's workerd processes, its reader made on the first read. */
const workerdMeter = (origin: string, dispatch: WorkerHandle['fetch'], spawned: Spawned) => {
  let reader = Option.none<CpuReader>()
  const meter: CpuMeter = {
    origin,
    // Straight to the Worker: over `origin` a second workerd, which proxies
    // what the harness serves, would spend time of its own on every request.
    fetch: async request =>
      dispatch(request.url, {
        method: request.method,
        headers: [...request.headers],
        ...(request.body === null ? {} : { body: await request.arrayBuffer() }),
      }),
    spent: async () => {
      if (spawned.shared)
        throw new Error(
          'Another stack started in this process while this one did, so whose workerd is ' +
            "whose is unknown: start stacks one at a time to read a stack's CPU.",
        )
      const current = Option.getOrElse(reader, readerFor)
      reader = Option.some(current)
      return current.read(
        spawned.processes
          .filter(child => isWorkerd(child) && isRunning(child))
          .flatMap(child => (child.pid === undefined ? [] : [child.pid])),
      )
    },
  }
  return { meter, close: () => Option.map(reader, open => open.close()) }
}

/**
 * Asks each route once, then `runs` times more, one request at a time, each
 * response read in full, and reads what each cost. Throws listing every
 * reading when a route spends more than the budget, or answers a 5xx, whose
 * cost says nothing of the route's.
 */
const budget = async (
  meter: CpuMeter,
  { routes, warm, cold, runs = 5 }: CpuBudget,
): Promise<ReadonlyArray<CpuReading>> => {
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error(`Cpu.budget: runs must be a whole number from 1, not ${runs}.`)
  const requestOf = (route: CpuRoute) =>
    typeof route === 'string' ? new Request(new URL(route, meter.origin)) : route()
  const readings: Array<CpuReading> = []
  for (const [name, route] of Object.entries(routes)) {
    let status = 0
    const ask = async () => {
      const response = await meter.fetch(requestOf(route))
      await response.arrayBuffer()
      status = response.status
      if (status >= 500) throw new Error(`Cpu.budget: ${name} answered ${status}.`)
    }
    const start = await meter.spent()
    await ask()
    const first = await meter.spent()
    for (let run = 0; run < runs; run++) await ask()
    const end = await meter.spent()
    readings.push({ route: name, status, cold: first - start, warm: (end - first) / runs })
  }
  const over = readings.filter(
    reading => reading.warm > warm || (cold !== undefined && reading.cold > cold),
  )
  if (over.length > 0)
    throw new Error(
      `Over the CPU budget (warm ${warm} ms${cold === undefined ? '' : `, cold ${cold} ms`}): ` +
        `${over.map(reading => reading.route).join(', ')}\n` +
        readings
          .map(
            reading =>
              `  ${reading.route}: cold ${reading.cold.toFixed(2)} ms, ` +
              `warm ${reading.warm.toFixed(2)} ms (status ${reading.status})`,
          )
          .join('\n'),
    )
  return readings
}

const pause = new Int32Array(new SharedArrayBuffer(4))

/**
 * Milliseconds this thread has run. Linux books a running thread's time at
 * each scheduler tick (4 ms at 250 Hz), and `threadCpuUsage` reads that
 * book; a millisecond's sleep has the scheduler book the rest, and its own
 * count is in nanoseconds. Read synchronously, so on this thread rather
 * than the pool's.
 */
const threadTime = (): number => {
  if (process.platform === 'linux') {
    Atomics.wait(pause, 0, 0, 1)
    return Number(readFileSync('/proc/thread-self/schedstat', 'utf8').split(' ')[0]) / 1e6
  }
  const { user, system } = process.threadCpuUsage()
  return (user + system) / 1000
}

/**
 * A meter over `answer` run in this process, by this thread's CPU time: for
 * a Worker's handler Node can run (no D1 or other binding of workerd's),
 * whose work happens on the thread that awaits it.
 */
const inThread = (
  answer: (request: Request) => Promise<CpuAnswer>,
  origin = 'http://localhost',
): CpuMeter => ({ origin, fetch: answer, spent: async () => threadTime() })

/**
 * What a request costs in CPU time, which Miniflare neither limits nor
 * reports, while a deployed Worker fails past its plan's limit (error 1102).
 * `Cpu.budget` reads routes through a meter: a stack's `cpu`, or `Cpu.inThread`.
 */
export const Cpu = { budget, inThread } as const

/**
 * The part of the configuration the stack reads itself. Wrangler validates
 * the whole of it when the harness loads it.
 */
const Config = Schema.Struct({
  main: Schema.String,
  compatibility_date: Schema.String,
  // The stack bundles; Wrangler bundling `main` again would deploy other code.
  no_bundle: Schema.Literal(true),
  d1_databases: Schema.optional(Schema.Array(Schema.Struct({ binding: Schema.String }))),
})

/**
 * The newest date the workerd Wrangler starts supports, from Wrangler's own
 * Miniflare: an application's own `miniflare` may be another release. Call it
 * after `wrangler()`, which says so when Wrangler is missing.
 */
const supportedDate = (): string => {
  const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler'))
  return Schema.decodeUnknownSync(Schema.Struct({ supportedCompatibilityDate: Schema.String }))(
    fromWrangler('miniflare'),
  ).supportedCompatibilityDate
}

const readConfig = async (path: string) => {
  const { experimental_readRawConfig } = await wrangler()
  const { rawConfig: raw } = experimental_readRawConfig({ config: path })
  if ('env' in raw)
    throw new Error(`${path}: the local stack runs the top-level Worker; [env.*] is not read.`)
  const config = Schema.decodeUnknownSync(Config)(raw)
  // Miniflare would run a date it does not know at its own latest, with a
  // warning nobody reads, and the tests would pass on a runtime the deploy does not get.
  const supported = supportedDate()
  if (config.compatibility_date > supported)
    throw new Error(
      `${path} asks for compatibility_date ${config.compatibility_date}, but the installed ` +
        `workerd supports up to ${supported}. Move wrangler to a release that knows it.`,
    )
  return { raw, config }
}

// The modules Vite's view-identity transform reads, and the loader each is read with.
const scriptLoaders: Readonly<Record<string, Loader>> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.mjs': 'js',
  '.jsx': 'jsx',
}
const SCRIPT = /\.(?:ts|tsx|js|jsx|mts|mjs)$/
const scripts = new Set(Object.values(scriptLoaders))
// Vite skips installed packages: Foldkit's own, whose brand would stamp every vnode as it is made.
const isPackaged = (path: string) => /[\\/]node_modules[\\/]/.test(path)

/**
 * The plugins, with the Worker's views branded as `@foldkit/vite-plugin`
 * brands the page's build: each function's result named by its module's path
 * from `root`. Foldkit adopts a served element only where that name is the
 * one the browser's view gives it; unbranded, the Worker's page was rebuilt on
 * every hydration, silently in production (#412).
 *
 * Vite brands what any load returns, but esbuild takes the first `onLoad`
 * that answers, so each plugin's is wrapped and a module it loads (with
 * `pnpm mutate`'s edits, say) is branded too. `foldkit/brand` resolves from
 * `root`, as the page's does; a root that resolves none has no Foldkit page
 * to match, and the Worker is bundled as written.
 */
const viewIdentity = (root: string, plugins: ReadonlyArray<Plugin>): Array<Plugin> => {
  // Found at each build's start, so a watched stack sees Foldkit installed.
  let brand = Option.none<string>()
  const resolving = Symbol('foldkit/brand')
  const brands = ({ path, namespace }: OnLoadArgs) =>
    Option.isSome(brand) && namespace === 'file' && SCRIPT.test(path) && !isPackaged(path)
  /** `contents` branded, or none where nothing in them returns. */
  const branded = async (
    contents: string | Uint8Array,
    loader: Loader,
    path: string,
  ): Promise<Option.Option<string>> => {
    const { transform } = await esbuild()
    const { transformViewIdentity } = await foldkitVite()
    // The brand reads JavaScript, as Vite hands it over after its own TypeScript pass.
    const { code } = await transform(contents, { loader, sourcefile: path })
    return Option.fromNullOr(transformViewIdentity(code, path, root)).pipe(
      Option.map(result => result.code),
    )
  }
  const brandedResult = async (result: OnLoadResult, args: OnLoadArgs): Promise<OnLoadResult> => {
    const loader = result.loader ?? scriptLoaders[extname(args.path)]
    const { contents } = result
    if (!brands(args) || contents === undefined || loader === undefined || !scripts.has(loader))
      return result
    return Option.match(await branded(contents, loader, args.path), {
      onNone: () => result,
      onSome: contents => ({ ...result, contents, loader: 'js' }),
    })
  }
  const wrapped = (plugin: Plugin): Plugin => ({
    ...plugin,
    setup: build =>
      plugin.setup({
        ...build,
        onLoad: (options, load) =>
          build.onLoad(options, async args => {
            const result = await load(args)
            return result === null || result === undefined ? result : brandedResult(result, args)
          }),
      }),
  })
  return [
    {
      name: 'foldkit-view-identity',
      setup: build => {
        build.onStart(async () => {
          const found = await build.resolve('foldkit/brand', {
            kind: 'import-statement',
            resolveDir: root,
            pluginData: resolving,
          })
          brand = found.errors.length === 0 ? Option.some(found.path) : Option.none()
        })
        build.onResolve({ filter: /^foldkit\/brand$/ }, args =>
          args.pluginData === resolving
            ? undefined
            : Option.match(brand, { onNone: () => undefined, onSome: path => ({ path }) }),
        )
      },
    },
    ...plugins.map(wrapped),
    {
      // Last: a module no plugin loaded, read from disk.
      name: 'foldkit-view-identity-load',
      setup: build =>
        build.onLoad({ filter: SCRIPT }, async args => {
          const loader = scriptLoaders[extname(args.path)]
          if (!brands(args) || loader === undefined) return undefined
          const code = await branded(await readFile(args.path), loader, args.path)
          return Option.match(code, {
            onNone: () => undefined,
            onSome: contents => ({ contents, loader: 'js' as const }),
          })
        }),
    },
  ]
}

/**
 * How the entry is bundled, for the stack and for `wrangler deploy`: the
 * script at `outfile`, and beside it any `.wasm` it imports, which `no_bundle`
 * Wrangler loads as a compiled module. `node:*` stays external for
 * `nodejs_compat`.
 */
const bundleOptions = (options: StackOptions, outfile: string) =>
  ({
    entryPoints: [options.entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['foldkit-plus:source'],
    external: ['cloudflare:workers', 'node:*'],
    loader: { '.wasm': 'copy' },
    plugins: viewIdentity(
      resolve(options.pageRoot ?? dirname(options.wrangler)),
      options.plugins ?? [],
    ),
    outdir: dirname(outfile),
    entryNames: basename(outfile, '.js'),
    write: false,
    logLevel: 'silent',
  }) satisfies BuildOptions

type OutputFiles = ReadonlyArray<OutputFile>

const writeOutputs = async (
  files: ReadonlyArray<{ readonly path: string; readonly contents: Uint8Array }>,
) => {
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true })
    await writeFile(file.path, file.contents)
  }
}

const identityOf = (files: OutputFiles) => files.map(file => `${file.path}:${file.hash}`).join()

/** Node's console method for each level workerd writes; any other prints as a log. */
const printers = new Map<string, (line: string) => void>([
  ['debug', line => console.debug(line)],
  ['info', line => console.info(line)],
  ['warn', line => console.warn(line)],
  ['error', line => console.error(line)],
])

const print = (log: WorkerLog) =>
  (printers.get(log.level) ?? (line => console.log(line)))(`[worker] ${log.message}`)

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Writes the bundle where `main` says, for `wrangler deploy`. */
const writeBundle = async (options: Omit<StackOptions, 'vars' | 'secrets'>): Promise<void> => {
  const { config } = await readConfig(options.wrangler)
  const outfile = resolve(dirname(options.wrangler), config.main)
  const { build } = await esbuild()
  await writeOutputs((await build(bundleOptions(options, outfile))).outputFiles)
}

type Raw = Awaited<ReturnType<typeof readConfig>>['raw']

/** What the stack runs: a configuration and a bundle, swapped in together. */
interface Running {
  readonly raw: Raw
  readonly config: typeof Config.Type
  readonly files: OutputFiles
}

const migrate = async (worker: WorkerHandle, config: typeof Config.Type) => {
  for (const database of config.d1_databases ?? []) await worker.applyD1Migrations(database.binding)
}

/**
 * Starts the Worker with a fresh, migrated D1 for each `[[d1_databases]]`,
 * and empty R2 and Durable Object storage. Each call is a stack of its own,
 * so test files running side by side share nothing.
 */
const start = async <Env>(options: StackOptions): Promise<Stack<Env>> => {
  const { raw, config } = await readConfig(options.wrangler)
  const { build, context } = await esbuild()
  const { createTestHarness } = await wrangler()
  const directory = join(tmpdir(), `foldkit-workers-${crypto.randomUUID()}`)
  const outfile = join(directory, basename(config.main))
  // Where a change is started on a workerd of its own before the swap.
  const trialDirectory = join(directory, 'trial')
  const bundle = bundleOptions(options, outfile)
  // In memory: a source that does not build fails here, before anything exists to clean up.
  const first = (await build(bundle)).outputFiles

  const optionsFor = (raw: Raw, main: string, vars: Vars | undefined) => ({
    root: dirname(options.wrangler),
    workers: [{ config: { ...raw, main }, vars, secrets: options.secrets }],
  })
  const given = options.vars
  // Given here, or once the stack knows its origin.
  let vars = typeof given === 'function' ? undefined : given
  const harness: TestHarness = createTestHarness(optionsFor(raw, outfile, vars))
  const spawned: Spawned = { processes: [], shared: false }
  // Where a trial's workerd goes: collected only so that a stack starting beside it knows.
  const trials: Spawned = { processes: [], shared: false }
  let closeMeter = () => {}
  // The harness keeps workerd's console and offers no handler, so it is drained:
  // read and cleared in one synchronous step, nothing is read twice or missed.
  const kept: Array<WorkerLog> = []
  const drain = () => {
    const fresh = harness.getLogs()
    harness.clearLogs()
    if (options.console !== 'quiet') fresh.forEach(print)
    kept.push(...fresh)
  }
  const draining = setInterval(drain, 100)
  draining.unref()
  let watching = Option.none<Promise<BuildContext>>()
  let configWatcher = Option.none<FSWatcher>()
  let rereading = Option.none<ReturnType<typeof setTimeout>>()
  // Swaps run one at a time, in the order their changes arrived.
  let swaps: Promise<void> = Promise.resolve()
  let stopping = Option.none<Promise<void>>()
  const dispose = async (watcher: Promise<BuildContext>) => {
    // A context that never opened has nothing to dispose; its failure was the watch's to report.
    const opened = await watcher.then(Option.some, () => Option.none<BuildContext>())
    if (Option.isSome(opened)) await opened.value.dispose()
  }
  // Each step runs however the one before it ended: a step skipped leaves
  // workerd running, or the bundle's directory behind.
  const stopOnce = async () => {
    clearInterval(draining)
    closeMeter()
    Option.map(rereading, clearTimeout)
    Option.map(configWatcher, watcher => watcher.close())
    try {
      const watcher = watching
      watching = Option.none()
      // Waits for a rebuild in flight, whose step sees `stopping`.
      if (Option.isSome(watcher)) await dispose(watcher.value)
      await swaps
    } finally {
      try {
        await harness.close()
      } finally {
        // What the Worker wrote since the last drain, up to its end, is printed and kept.
        drain()
        await rm(directory, { recursive: true, force: true })
      }
    }
  }
  const stop = () =>
    Option.getOrElse(stopping, () => {
      const once = stopOnce()
      stopping = Option.some(once)
      return once
    })

  try {
    await writeOutputs(first)
    const { url } = await collect(spawned, () => harness.listen())
    // A reload at the same origin, as a swap is, before any request of the caller's.
    if (typeof given === 'function') {
      vars = given(url.origin)
      await collect(spawned, () => harness.update(optionsFor(raw, outfile, vars)))
    }
    const worker = harness.getWorker()
    const metered = workerdMeter(url.origin, worker.fetch, spawned)
    closeMeter = metered.close
    await migrate(worker, config)

    const watch = async (listener: WatchListener) => {
      if (Option.isSome(stopping)) throw new Error('This stack has stopped.')
      if (Option.isSome(watching)) throw new Error('This stack is already watching.')
      // None once a swap failed after its trial and took the runtime with it.
      let running = Option.some<Running>({ raw, config, files: first })

      /**
       * Starts `next` on a workerd of its own, then swaps it in. A Worker
       * that does not start is refused there, and the stack's harness, which
       * a failed update tears down with its storage, never sees it.
       */
      const swap = async (next: Running) => {
        try {
          await writeOutputs(
            next.files.map(file => ({
              path: join(trialDirectory, relative(directory, file.path)),
              contents: file.contents,
            })),
          )
          const trial = createTestHarness(
            optionsFor(next.raw, join(trialDirectory, basename(outfile)), vars),
          )
          try {
            await collect(trials, () => trial.listen())
            await migrate(trial.getWorker(), next.config)
          } finally {
            await trial.close()
          }
        } catch (error) {
          listener.onRefused(errorText(error))
          return
        }
        try {
          await writeOutputs(next.files)
          await collect(spawned, () => harness.update(optionsFor(next.raw, outfile, vars)))
        } catch (error) {
          running = Option.none()
          listener.onStopped(errorText(error))
          return
        }
        running = Option.some(next)
        try {
          await migrate(harness.getWorker(), next.config)
        } catch (error) {
          listener.onRefused(
            `The Worker was swapped in, but a migration failed: ${errorText(error)}`,
          )
          return
        }
        listener.onSwap()
      }
      /** Queues a swap of what `change` makes of the running stack, which may be none. */
      const enqueue = (change: (now: Running) => Promise<Option.Option<Running>>) => {
        const step = swaps.then(async () => {
          // A step that runs once `stop` began swaps nothing: `stop` waits for
          // it before closing the harness, so it would swap into a closing stack.
          if (Option.isNone(running) || Option.isSome(stopping)) return
          const next = await change(running.value)
          if (Option.isSome(next)) await swap(next.value)
        })
        // A listener that throws fails its own step, not the ones after it.
        swaps = step.catch(() => undefined)
        return step
      }

      const watcher = context({
        ...bundle,
        plugins: [
          ...bundle.plugins,
          {
            name: 'foldkit-swap',
            setup: build =>
              build.onEnd(result =>
                enqueue(async now => {
                  if (result.errors.length > 0) {
                    listener.onRefused(result.errors.map(error => error.text).join('\n'))
                    return Option.none()
                  }
                  const files = result.outputFiles ?? []
                  // An editor saving in place empties the file before writing it, and a
                  // rebuild can read it then; the write's own rebuild swaps.
                  if (files.some(file => file.path === outfile && file.contents.length === 0)) {
                    listener.onRefused(
                      `${options.entry} bundles to no code, so no Worker could start.`,
                    )
                    return Option.none()
                  }
                  return identityOf(files) === identityOf(now.files)
                    ? Option.none()
                    : Option.some({ ...now, files })
                }),
              ),
          },
        ],
      })
      watching = Option.some(watcher)
      try {
        await (await watcher).watch()
      } catch (error) {
        // Not watching after all: `stop` must not wait on this context, nor a second `watch` be refused.
        if (Option.contains(watching, watcher)) {
          watching = Option.none()
          await dispose(watcher)
        }
        throw error
      }
      // A `stop` that began while the context opened would close no watcher made now.
      if (Option.isSome(stopping)) return

      const reread = () =>
        enqueue(async now => {
          const read = await readConfig(options.wrangler).then(Option.some, (error: unknown) => {
            listener.onRefused(errorText(error))
            return Option.none<Awaited<ReturnType<typeof readConfig>>>()
          })
          // A save that changed nothing the configuration says.
          return read.pipe(
            Option.filter(({ raw }) => JSON.stringify(raw) !== JSON.stringify(now.raw)),
            Option.map(({ raw, config }) => ({ ...now, raw, config })),
          )
        })
      // The directory, not the file: an editor that renames a temporary over the
      // file replaces what a file watcher watches.
      const name = basename(options.wrangler)
      configWatcher = Option.some(
        watchFile(dirname(options.wrangler), (_, changed) => {
          if (changed !== name) return
          // One reread for the burst of events a single save makes.
          Option.map(rereading, clearTimeout)
          rereading = Option.some(setTimeout(() => void reread(), 50))
        }).on('error', error =>
          listener.onRefused(`The configuration is no longer watched: ${errorText(error)}`),
        ),
      )
    }

    const env = () => harness.getWorker<Env>().getEnv()
    const logs = () => {
      drain()
      return kept.splice(0)
    }
    return {
      origin: url.origin,
      env,
      dispatch: worker.fetch,
      logs,
      cpu: metered.meter,
      watch,
      stop,
    }
  } catch (error) {
    // The start's failure is the one to report; a failure cleaning up after it would hide it.
    await stop().catch(() => undefined)
    throw error
  }
}

/**
 * The local Workers stack. `Stack.start` runs the Worker for tests and
 * development; `Stack.writeBundle` writes what `wrangler deploy` uploads,
 * bundled the same way.
 */
export const Stack = { start, writeBundle } as const
