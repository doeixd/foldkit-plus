/**
 * A Worker on a local workerd, configured by its own `wrangler.toml`.
 *
 * Wrangler's test harness reads the configuration, so bindings, the
 * compatibility date and flags, `.dev.vars` and D1 migrations mean here what
 * they mean to `wrangler deploy`. This module owns only what Wrangler cannot
 * know: the bundle. esbuild builds the entry with the workspace's source
 * condition into a directory of the stack's own, and the harness runs
 * `wrangler.toml` with `main` pointed there. Nothing here names this example;
 * `stack.ts` is the example's call.
 */
import {
  build,
  context,
  type BuildContext,
  type BuildOptions,
  type OutputFile,
  type Plugin,
} from 'esbuild'
import { Option, Schema } from 'effect'
import { type DispatchFetch, supportedCompatibilityDate } from 'miniflare'
import { parse } from 'smol-toml'
import { createTestHarness, type TestHarness } from 'wrangler'
import { appendFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

export interface WorkersStackOptions {
  /** The Worker's `wrangler.toml`. */
  readonly wrangler: string
  /** The source esbuild bundles into what `main` names. */
  readonly entry: string
  /** Local values for vars the deployed Worker is given elsewhere. */
  readonly vars?: Readonly<Record<string, string>>
  /** Local values for secrets, over any in `.dev.vars`. */
  readonly secrets?: Readonly<Record<string, string>>
}

/** What a watched stack reports after each change to the bundle's sources. */
export interface WatchListener {
  /** The new Worker answers at the same origin, over the same storage. */
  readonly onSwap: () => void
  /** The change did not build. The running Worker keeps answering. */
  readonly onBuildError: (message: string) => void
  /**
   * The new Worker did not start. Wrangler's harness tears its runtime down
   * with it, storage included, so the stack has stopped answering and
   * watches no more: call `stop`, and start again.
   */
  readonly onStopped: (message: string) => void
}

export interface WorkersStack<Env> {
  /** Where the Worker answers over real HTTP. */
  readonly origin: string
  /**
   * The Worker's bindings, as the Worker sees them. A swap retires the ones
   * read before it (Miniflare's "poisoned stub"), so read them after.
   */
  readonly env: () => Promise<Env>
  /** A request straight to the Worker; an upgrade answers with its socket. */
  readonly dispatch: DispatchFetch
  /**
   * Rebuilds on every change to a file the bundle read, and swaps the new
   * Worker in at the same origin. D1, R2 and Durable Object storage stay.
   */
  readonly watch: (listener: WatchListener) => Promise<void>
  readonly stop: () => Promise<void>
}

/**
 * The part of `wrangler.toml` the stack reads itself. Wrangler validates the
 * whole file when the harness loads it.
 */
const WranglerToml = Schema.Struct({
  main: Schema.String,
  compatibility_date: Schema.String,
  // The stack bundles; Wrangler bundling `main` again would deploy other code.
  no_bundle: Schema.Literal(true),
  d1_databases: Schema.optional(Schema.Array(Schema.Struct({ binding: Schema.String }))),
})

/**
 * Refuses a date the installed workerd does not know. Miniflare would run the
 * Worker at its own latest date instead, with a warning nobody reads, and the
 * tests would pass on a runtime the deploy does not get.
 */
export const checkCompatibilityDate = (date: string, supported: string): void => {
  if (date > supported)
    throw new Error(
      `wrangler.toml asks for compatibility_date ${date}, but the installed workerd supports ` +
        `up to ${supported}. Move wrangler and miniflare to a release that knows ${date}.`,
    )
}

const readWrangler = async (path: string) => {
  const raw = parse(await readFile(path, 'utf8'))
  if ('env' in raw)
    throw new Error(`${path}: the local stack runs the top-level Worker; [env.*] is not read.`)
  const toml = Schema.decodeUnknownSync(WranglerToml)(raw)
  checkCompatibilityDate(toml.compatibility_date, supportedCompatibilityDate)
  return { raw, toml }
}

/** One edit of a mutation, as `pnpm mutate` (`scripts/mutate.mjs`) sends it. */
interface MutationEdit {
  readonly file: string
  readonly find: string
  readonly replace: string
  readonly all: boolean
}

// esbuild's paths and the runner's differ in separators and, on Windows, case.
const pathOf = (path: string) => resolve(path).split(sep).join('/').toLowerCase()

/**
 * `pnpm mutate`'s edits, applied to the Worker's sources as esbuild bundles
 * them, as `vitest.shared.ts` applies them to what Vite loads: this bundle is
 * esbuild's, so that plugin never reaches it. Each edit that applies is
 * recorded in the marker file. Without `FOLDKIT_MUTATION` it does nothing.
 */
const mutation = (): Plugin => ({
  name: 'foldkit-mutation',
  setup: build => {
    const raw = process.env['FOLDKIT_MUTATION']
    const marker = process.env['FOLDKIT_MUTATION_MARKER']
    if (raw === undefined || marker === undefined) return
    const edits: ReadonlyArray<MutationEdit> = JSON.parse(raw)
    build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      const code = await readFile(path, 'utf8')
      let next = code
      edits.forEach((edit, index) => {
        if (pathOf(edit.file) !== pathOf(path) || !next.includes(edit.find)) return
        next = edit.all
          ? next.split(edit.find).join(edit.replace)
          : next.replace(edit.find, edit.replace)
        appendFileSync(marker, `${index}\n`)
      })
      return next === code ? undefined : { contents: next, loader: 'ts' }
    })
  },
})

/**
 * How the entry is bundled, for the stack and for `wrangler deploy`: the
 * script at `outfile`, and beside it any `.wasm` it imports, which `no_bundle`
 * Wrangler loads as a compiled module. `node:*` stays external for
 * `nodejs_compat`.
 */
const bundleOptions = (entry: string, outfile: string) =>
  ({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['foldkit-plus:source'],
    external: ['cloudflare:workers', 'node:*'],
    loader: { '.wasm': 'copy' },
    plugins: [mutation()],
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

/** Writes the bundle where `main` says, for `wrangler deploy`. */
export const writeWorker = async (options: Pick<WorkersStackOptions, 'wrangler' | 'entry'>) => {
  const { toml } = await readWrangler(options.wrangler)
  const outfile = resolve(dirname(options.wrangler), toml.main)
  await writeOutputs((await build(bundleOptions(options.entry, outfile))).outputFiles)
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Starts the Worker with a fresh, migrated D1 for each `[[d1_databases]]`,
 * and empty R2 and Durable Object storage. Each call is a stack of its own,
 * so test files running side by side share nothing.
 */
export const startWorkersStack = async <Env>(
  options: WorkersStackOptions,
): Promise<WorkersStack<Env>> => {
  const { raw, toml } = await readWrangler(options.wrangler)
  const directory = join(tmpdir(), `foldkit-workers-${crypto.randomUUID()}`)
  const outfile = join(directory, basename(toml.main))
  const bundle = bundleOptions(options.entry, outfile)
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
  const stop = async () => {
    if (Option.isSome(watching)) await (await watching.value).dispose()
    await harness.close()
    await rm(directory, { recursive: true, force: true })
  }

  try {
    await writeOutputs(first)
    const { url } = await harness.listen()
    const worker = harness.getWorker()
    for (const database of toml.d1_databases ?? []) await worker.applyD1Migrations(database.binding)

    const watch = async (listener: WatchListener) => {
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
                if (Option.isNone(running)) return
                if (result.errors.length > 0) {
                  listener.onBuildError(result.errors.map(error => error.text).join('\n'))
                  return
                }
                const next = identityOf(result.outputFiles ?? [])
                if (Option.contains(running, next)) return
                try {
                  await writeOutputs(result.outputFiles ?? [])
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
      await (await watcher).watch()
    }

    const env = () => harness.getWorker<Env>().getEnv()
    return { origin: url.origin, env, dispatch: worker.fetch, watch, stop }
  } catch (error) {
    await stop()
    throw error
  }
}
