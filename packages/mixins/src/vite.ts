/**
 * `foldkit-mixins/vite`: the application's stylesheet as a file. A server
 * that writes the sheet into every page sends it every time and has its
 * framework parse it again to check the page; a hashed file is fetched once
 * and cached. The plugin builds the sheet module, writes `assets/styles-<hash>.css`
 * into the browser build, and gives the server entry its address:
 *
 * ```ts
 * import { href } from 'virtual:foldkit-styles'
 * ```
 *
 * In dev the same `href` serves the sheet from the dev server, so the server
 * entry has one code path.
 *
 * The style modules named in `modules` are evaluated in the same pass, and a
 * production browser build ships each as data: its Styles' classes, not the
 * compiler that worked them out (`viteFreeze.ts`, #420).
 */
import { createHash } from 'node:crypto'
import type { Plugin, ResolvedConfig, Rollup, ViteDevServer } from 'vite'
import { prune } from './theme/prune.js'
import { assertRules, freeze, importsRecorded, type FrozenModule } from './viteFreeze.js'

const VIRTUAL = 'virtual:foldkit-styles'
const SHEET = 'virtual:foldkit-styles-sheet'
// Rollup's mark for a module no file holds, which other plugins leave alone.
const NUL = String.fromCharCode(0)
const DEV_PATH = '/__foldkit-styles.css'
/** Defined in a production browser build that freezes modules: `SlotView` then injects nothing. */
const FROZEN_DEFINE = '__FOLDKIT_MIXINS_FROZEN_STYLES__'

export interface StylesOptions {
  /** A module id (as an import would write it) that exports the application's stylesheet text as `stylesheet`. */
  readonly sheet: string
  /**
   * Ship only the `--fk-*` tokens the sheet reads (`Inert.prune`), and those
   * `keep` names: a token a view reads inline (`Theme.ref`) or a script reads
   * by name. Run `Inert.missingTokens` over a drawn page and the pruned sheet
   * in a test, so a token pruning took from a view fails there.
   */
  readonly prune?: { readonly keep?: ReadonlyArray<string> } | undefined
  /**
   * Style modules (ids as an import would write them) the production browser
   * build replaces with what they evaluate to: each Style's name and the
   * classes and inline declarations its Slots draw, so the page loads no
   * style compiler. Each export must be a Style, a `Style.slots` declaration,
   * a string or an object of strings (`t`). A `Style.whenInput` is kept when
   * its predicate is a named import from a module that is not listed (the
   * page imports it as written); a predicate written in place, or imported
   * from a listed module, fails the build, and so does `Style.perItem`, which
   * a module that needs one avoids by staying off the list. With any module listed, the build's Slots inject no CSS: the sheet
   * holds every class, and the build fails if a frozen class has no rule in it
   * or if the page still compiles a Style (a module off the list).
   * Development is unchanged.
   */
  readonly modules?: ReadonlyArray<string> | undefined
}

/**
 * The module the plugin builds: the sheet, completed with every class its
 * modules compiled, and the style modules listed, which load first so their
 * classes are among them.
 */
const sheetSource = (sheet: string, modules: ReadonlyArray<string>): string =>
  [
    `import { stylesheet } from ${JSON.stringify(sheet)}`,
    ...modules.map((id, index) => `import * as module${index} from ${JSON.stringify(id)}`),
    `import { Style } from 'foldkit-mixins'`,
    `export const css = Style.complete(stylesheet)`,
    `export const modules = [${modules.map((_, index) => `module${index}`).join(', ')}]`,
  ].join('\n')

const sheetModule = (sheet: string, modules: ReadonlyArray<string>): Plugin => ({
  name: 'foldkit-mixins:styles-sheet',
  resolveId: id => (id === SHEET ? NUL + SHEET : undefined),
  load: id => (id === NUL + SHEET ? sheetSource(sheet, modules) : undefined),
})

interface Evaluated {
  readonly css: string
  /** Each listed module's exports, in the order of `modules`. */
  readonly modules: ReadonlyArray<Readonly<Record<string, unknown>>>
  /** The files the sheet names (a font's `?url`), which only the browser build can emit. */
  readonly assets: ReadonlyArray<Rollup.OutputAsset>
}

/**
 * The sheet's CSS, from a build of the sheet module on its own that runs here:
 * bundled whole, so an import of a file (`?url`) is the same hashed address the
 * browser build gives it, which the running dev server's address would not be.
 */
const buildSheet = async (
  config: ResolvedConfig,
  sheet: string,
  modules: ReadonlyArray<string>,
): Promise<Evaluated> => {
  const { build } = await import('vite')
  const output = await build({
    configFile: false,
    root: config.root,
    mode: config.mode,
    base: config.base,
    logLevel: 'silent',
    resolve: { conditions: config.resolve.conditions, alias: config.resolve.alias },
    ssr: {
      noExternal: true,
      resolve: { conditions: config.ssr.resolve?.conditions ?? config.resolve.conditions },
    },
    plugins: [sheetModule(sheet, modules), importsRecorded(modules)],
    build: {
      ssr: true,
      // Compiling a Style registers its class as a side effect, and a module
      // imported only for that has no export in use: treeshaking would drop
      // it (a package's `sideEffects: false`, or an unused call's result)
      // before it ran, and its classes would be missing from the sheet.
      rollupOptions: { input: SHEET, treeshake: false },
      write: false,
      minify: false,
      emptyOutDir: false,
      // A server build emits no files by default, so the sheet's fonts would
      // be named in it and written nowhere.
      emitAssets: true,
      assetsInlineLimit: config.build.assetsInlineLimit,
    },
  })
  const files = [output].flat().flatMap(result => ('output' in result ? result.output : []))
  const chunk = files.find(file => file.type === 'chunk')
  if (chunk === undefined || chunk.type !== 'chunk')
    throw new Error(`foldkit-mixins/vite: building "${sheet}" produced no module`)
  const loaded: unknown = await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`
  )
  // The module `sheetSource` wrote: its two exports are known.
  const { css, modules: namespaces } = loaded as Pick<Evaluated, 'modules'> & {
    readonly css: unknown
  }
  if (typeof css !== 'string')
    throw new Error(
      `foldkit-mixins/vite: "${sheet}" does not export its stylesheet text as \`stylesheet\``,
    )
  return {
    css,
    modules: namespaces,
    assets: files.filter((file): file is Rollup.OutputAsset => file.type === 'asset'),
  }
}

interface Built {
  readonly css: string
  readonly fileName: string
  readonly href: string
  /** Each listed module as the browser build ships it, by its id in `modules`. */
  readonly frozen: ReadonlyMap<string, FrozenModule>
  readonly assets: ReadonlyArray<Rollup.OutputAsset>
}

// The Style compiler's rules module, the one thing a page that compiles a Style at run time holds.
const COMPILER = /[\\/]styleRules\.[cm]?[jt]s$/
const OWN_PACKAGE = /[\\/]mixins[\\/](src|dist)[\\/]|[\\/]foldkit-mixins[\\/]/

/**
 * Freezing turns the run-time injection off, which a Style compiled in the
 * page needs for its classes to have any rule: one in a module off the list,
 * or made per item at draw time. The compiler in the bundle is the sign of
 * one, so the build names the modules that bring it and fails.
 */
const refuseCompiler = (context: Rollup.PluginContext, bundle: Rollup.OutputBundle): void => {
  const rendered = new Set(
    Object.values(bundle).flatMap(file =>
      file.type === 'chunk'
        ? Object.entries(file.modules).flatMap(([id, info]) =>
            info.renderedLength > 0 ? [id] : [],
          )
        : [],
    ),
  )
  const compiler = [...rendered].filter(id => COMPILER.test(id))
  if (compiler.length === 0) return
  // Up from the compiler through this package to the application's own modules.
  const culprits = new Set<string>()
  const seen = new Set<string>(compiler)
  const queue = [...compiler]
  for (const id of queue)
    for (const importer of context.getModuleInfo(id)?.importers ?? []) {
      if (seen.has(importer)) continue
      seen.add(importer)
      if (OWN_PACKAGE.test(importer)) queue.push(importer)
      else if (rendered.has(importer)) culprits.add(importer)
    }
  throw new Error(
    `foldkit-mixins/vite: ${[...culprits].slice(0, 5).join(', ') || 'a module'} compiles Styles in the browser build, which \`modules\` leaves with no run-time injection, so a class compiled there would have no rule. List the module in \`modules\`, or drop \`modules\`.`,
  )
}

/** The plugin: see the module's comment. */
export const styles = (options: StylesOptions): Plugin => {
  const modules = [...new Set(options.modules ?? [])]
  let config: ResolvedConfig
  let dev: ViteDevServer | undefined
  let devCss: Promise<string> | undefined
  let built: Promise<Built> | undefined
  /** The resolved file of each listed module, in the browser build, to its id in `modules`. */
  const listed = new Map<string, string>()
  // Dev serves the same pruned sheet a build ships, so a missing token shows there first.
  const shipped = (css: string): string =>
    options.prune === undefined ? css : prune(css, options.prune)

  const build = (): Promise<Built> =>
    (built ??= buildSheet(config, options.sheet, modules).then(evaluated => {
      const css = shipped(evaluated.css)
      const frozen = new Map(
        modules.map((id, index) => {
          const namespace = evaluated.modules[index]
          if (namespace === undefined)
            throw new Error(`foldkit-mixins/vite: building the sheet did not evaluate "${id}"`)
          return [id, freeze(id, namespace)]
        }),
      )
      // With no injection behind it, a frozen class the shipped sheet lacks
      // would draw nothing: refuse the build instead.
      assertRules(frozen, css)
      const fileName = `assets/styles-${createHash('sha256').update(css).digest('hex').slice(0, 8)}.css`
      return { css, fileName, href: `${config.base}${fileName}`, frozen, assets: evaluated.assets }
    }))

  const freezing = (environment: string): boolean =>
    modules.length > 0 && config.command === 'build' && environment === 'client'

  return {
    name: 'foldkit-mixins:styles',
    sharedDuringBuild: true,
    configResolved(resolved) {
      config = resolved
      if (resolved.command === 'build' && !/^(\/|https?:\/\/)/.test(resolved.base)) {
        throw new Error(
          `foldkit-mixins/vite: base "${resolved.base}" is relative, so the sheet's address would depend on the page; give base an absolute path or URL`,
        )
      }
    },
    configEnvironment(name, _options, env) {
      // `freezing`'s test, before `config` is resolved.
      if (modules.length === 0 || env.command !== 'build' || name !== 'client') return undefined
      return { define: { [FROZEN_DEFINE]: 'true' } }
    },
    configureServer(server) {
      dev = server
      // The sheet is read from the modules the server has loaded, so an edit means reading it again.
      server.watcher.on('change', () => {
        devCss = undefined
      })
      server.middlewares.use(DEV_PATH, (_request, response, next) => {
        devCss ??= server.ssrLoadModule(SHEET).then(loaded => shipped(String(loaded.css)))
        devCss.then(
          css => {
            response.setHeader('content-type', 'text/css; charset=utf-8')
            response.setHeader('cache-control', 'no-cache')
            response.end(css)
          },
          error => {
            devCss = undefined
            next(error)
          },
        )
      })
    },
    async buildStart() {
      if (this.environment.name === 'client') built = undefined
      if (!freezing(this.environment.name)) return
      listed.clear()
      for (const id of modules) {
        const resolved = await this.resolve(id)
        if (resolved === null)
          throw new Error(
            `foldkit-mixins/vite: the style module "${id}" in \`modules\` does not resolve`,
          )
        listed.set(resolved.id, id)
      }
    },
    resolveId(id) {
      if (id === VIRTUAL) return NUL + VIRTUAL
      // The dev server loads the sheet through this plugin; a build loads it through its own.
      if (id === SHEET && dev !== undefined) return NUL + SHEET
      return undefined
    },
    async load(id) {
      if (id === NUL + SHEET) return sheetSource(options.sheet, modules)
      const module = freezing(this.environment.name) ? listed.get(id) : undefined
      if (module !== undefined) return (await build()).frozen.get(module)?.source
      if (id !== NUL + VIRTUAL) return undefined
      const href = dev === undefined ? (await build()).href : DEV_PATH
      return `export const href = ${JSON.stringify(href)}`
    },
    async generateBundle(_options, bundle) {
      // The browser build comes first, and is the one a host serves files from.
      if (this.environment.name !== 'client') return
      if (freezing(this.environment.name)) refuseCompiler(this, bundle)
      const { css, fileName, assets } = await build()
      this.emitFile({ type: 'asset', fileName, source: css })
      // Hashed by content, so a file the browser build also references is the same file.
      for (const asset of assets)
        if (!(asset.fileName in bundle))
          this.emitFile({ type: 'asset', fileName: asset.fileName, source: asset.source })
    },
  }
}
