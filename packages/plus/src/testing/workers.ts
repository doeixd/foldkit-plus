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
 * `wrangler` and `esbuild` are optional peers of `foldkit-plus`, loaded on the
 * first call; Miniflare is read from Wrangler's own copy, so the date check
 * asks the runtime Wrangler starts.
 */
import { Option, Schema } from 'effect'
import type { BuildContext, BuildOptions, OutputFile, Plugin } from 'esbuild'
import type { TestHarness, WorkerHandle } from 'wrangler'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { peer } from './peer.js'

const SUBPATH = 'testing/workers'

const wrangler = () => peer(SUBPATH, 'wrangler', () => import('wrangler'))
const esbuild = () => peer(SUBPATH, 'esbuild', () => import('esbuild'))

export interface StackOptions {
  /** The Worker's Wrangler configuration (`wrangler.toml`, `.json` or `.jsonc`). */
  readonly wrangler: string
  /** The source esbuild bundles into what `main` names. */
  readonly entry: string
  /** Local values for vars the deployed Worker is given elsewhere. */
  readonly vars?: Readonly<Record<string, string>>
  /** Local values for secrets, over any in `.dev.vars`. */
  readonly secrets?: Readonly<Record<string, string>>
  /** esbuild plugins for the bundle, the deploy's and the stack's alike. */
  readonly plugins?: ReadonlyArray<Plugin>
}

/** What a watched stack reports after each change to the bundle's sources. */
export interface WatchListener {
  /** The new Worker answers at the same origin, over the same storage. */
  readonly onSwap: () => void
  /**
   * The change did not build, or built no code, as an entry saved in place
   * reads for a moment. The running Worker keeps answering.
   */
  readonly onBuildError: (message: string) => void
  /**
   * The new Worker did not start. Wrangler's harness tears its runtime down
   * with it, storage included, so the stack has stopped answering and
   * watches no more: call `stop`, and start again.
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
   * Rebuilds on every change to a file the bundle read, and swaps the new
   * Worker in at the same origin. D1, R2 and Durable Object storage stay.
   */
  readonly watch: (listener: WatchListener) => Promise<void>
  /**
   * Stops watching, stops workerd and removes the bundle's directory, each
   * even when one before it failed. A rebuild still in flight swaps nothing
   * and reports nothing. A second call returns the first one's promise.
   */
  readonly stop: () => Promise<void>
}

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
    plugins: [...(options.plugins ?? [])],
    outdir: dirname(outfile),
    entryNames: basename(outfile, '.js'),
    write: false,
    logLevel: 'silent',
  }) satisfies BuildOptions

type OutputFiles = ReadonlyArray<OutputFile>

const writeOutputs = async (files: OutputFiles) => {
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true })
    await writeFile(file.path, file.contents)
  }
}

const identityOf = (files: OutputFiles) => files.map(file => `${file.path}:${file.hash}`).join()

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Writes the bundle where `main` says, for `wrangler deploy`. */
const writeBundle = async (options: Omit<StackOptions, 'vars' | 'secrets'>): Promise<void> => {
  const { config } = await readConfig(options.wrangler)
  const outfile = resolve(dirname(options.wrangler), config.main)
  const { build } = await esbuild()
  await writeOutputs((await build(bundleOptions(options, outfile))).outputFiles)
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
  const bundle = bundleOptions(options, outfile)
  // In memory: a source that does not build fails here, before anything exists to clean up.
  const first = (await build(bundle)).outputFiles

  const harness: TestHarness = createTestHarness({
    root: dirname(options.wrangler),
    workers: [
      {
        config: { ...raw, main: outfile },
        vars: options.vars,
        secrets: options.secrets,
      },
    ],
  })
  let watching = Option.none<Promise<BuildContext>>()
  let stopping = Option.none<Promise<void>>()
  const dispose = async (watcher: Promise<BuildContext>) => {
    // A context that never opened has nothing to dispose; its failure was the watch's to report.
    const opened = await watcher.then(Option.some, () => Option.none<BuildContext>())
    if (Option.isSome(opened)) await opened.value.dispose()
  }
  // Each step runs however the one before it ended: a step skipped leaves
  // workerd running, or the bundle's directory behind.
  const stopOnce = async () => {
    try {
      const watcher = watching
      watching = Option.none()
      // Waits for a rebuild in flight, whose `onEnd` sees `stopping`.
      if (Option.isSome(watcher)) await dispose(watcher.value)
    } finally {
      try {
        await harness.close()
      } finally {
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
    const { url } = await harness.listen()
    const worker = harness.getWorker()
    for (const database of config.d1_databases ?? [])
      await worker.applyD1Migrations(database.binding)

    const watch = async (listener: WatchListener) => {
      if (Option.isSome(stopping)) throw new Error('This stack has stopped.')
      if (Option.isSome(watching)) throw new Error('This stack is already watching.')
      // The bundle running now; none once a Worker did not start and took the runtime with it.
      let running = Option.some(identityOf(first))
      const watcher = context({
        ...bundle,
        plugins: [
          ...bundle.plugins,
          {
            name: 'foldkit-swap',
            setup: build =>
              build.onEnd(async result => {
                // A rebuild that ends once `stop` began swaps nothing: `stop` waits
                // for it before closing the harness, so it would swap into a closing stack.
                if (Option.isNone(running) || Option.isSome(stopping)) return
                if (result.errors.length > 0) {
                  listener.onBuildError(result.errors.map(error => error.text).join('\n'))
                  return
                }
                const files = result.outputFiles ?? []
                // An editor saving in place empties the file before writing it, and a
                // rebuild can read it then. A Worker with no code never starts, and one
                // that does not start takes the runtime down, D1 with it; the write's own
                // rebuild swaps.
                if (files.some(file => file.path === outfile && file.contents.length === 0)) {
                  listener.onBuildError(
                    `${options.entry} bundles to no code, so no Worker could start.`,
                  )
                  return
                }
                const next = identityOf(files)
                if (Option.contains(running, next)) return
                try {
                  await writeOutputs(files)
                  await harness.update(same => same)
                  running = Option.some(next)
                  listener.onSwap()
                } catch (error) {
                  running = Option.none()
                  listener.onStopped(errorText(error))
                }
              }),
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
    }

    const env = () => harness.getWorker<Env>().getEnv()
    return { origin: url.origin, env, dispatch: worker.fetch, watch, stop }
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
