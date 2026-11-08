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
 */
import { createHash } from 'node:crypto'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { prune } from './theme/prune.js'

const VIRTUAL = 'virtual:foldkit-styles'
const SHEET = 'virtual:foldkit-styles-sheet'
// Rollup's mark for a module no file holds, which other plugins leave alone.
const NUL = String.fromCharCode(0)
const DEV_PATH = '/__foldkit-styles.css'

export interface StylesOptions {
  /** A module id (as an import would write it) that exports the application's stylesheet text as `stylesheet`. */
  readonly sheet: string
  /**
   * Ship only the `--fk-*` tokens the sheet reads (`Theme.prune`), and those
   * `keep` names: a token a view reads inline (`Theme.ref`) or a script reads
   * by name. Run `Inert.missingTokens` over a drawn page and the pruned sheet
   * in a test, so a token pruning took from a view fails there.
   */
  readonly prune?: { readonly keep?: ReadonlyArray<string> } | undefined
}

/** The module the plugin builds: the sheet, completed with every class its modules compiled. */
const sheetSource = (sheet: string): string =>
  [
    `import { stylesheet } from ${JSON.stringify(sheet)}`,
    `import { Style } from 'foldkit-mixins'`,
    `export const css = Style.complete(stylesheet)`,
  ].join('\n')

const sheetModule = (sheet: string): Plugin => ({
  name: 'foldkit-mixins:styles-sheet',
  resolveId: id => (id === SHEET ? NUL + SHEET : undefined),
  load: id => (id === NUL + SHEET ? sheetSource(sheet) : undefined),
})

/**
 * The sheet's CSS, from a build of the sheet module on its own that runs here:
 * bundled whole, so an import of a file (`?url`) is the same hashed address the
 * browser build gives it, which the running dev server's address would not be.
 */
const buildSheet = async (config: ResolvedConfig, sheet: string): Promise<string> => {
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
    plugins: [sheetModule(sheet)],
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
      assetsInlineLimit: config.build.assetsInlineLimit,
    },
  })
  const chunk = [output].flat().flatMap(result => ('output' in result ? result.output : []))[0]
  if (chunk === undefined || chunk.type !== 'chunk')
    throw new Error(`foldkit-mixins/vite: building "${sheet}" produced no module`)
  const loaded: unknown = await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`
  )
  const css =
    typeof loaded === 'object' && loaded !== null && 'css' in loaded ? loaded.css : undefined
  if (typeof css !== 'string')
    throw new Error(
      `foldkit-mixins/vite: "${sheet}" does not export its stylesheet text as \`stylesheet\``,
    )
  return css
}

interface Built {
  readonly css: string
  readonly fileName: string
  readonly href: string
}

/** The plugin: see the module's comment. */
export const styles = (options: StylesOptions): Plugin => {
  let config: ResolvedConfig
  let dev: ViteDevServer | undefined
  let devCss: Promise<string> | undefined
  let built: Promise<Built> | undefined
  // Dev serves the same pruned sheet a build ships, so a missing token shows there first.
  const shipped = (css: string): string =>
    options.prune === undefined ? css : prune(css, options.prune)

  const build = (): Promise<Built> =>
    (built ??= buildSheet(config, options.sheet)
      .then(shipped)
      .then(css => {
        const fileName = `assets/styles-${createHash('sha256').update(css).digest('hex').slice(0, 8)}.css`
        return { css, fileName, href: `${config.base}${fileName}` }
      }))

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
    buildStart() {
      if (this.environment.name === 'client') built = undefined
    },
    resolveId(id) {
      if (id === VIRTUAL) return NUL + VIRTUAL
      // The dev server loads the sheet through this plugin; a build loads it through its own.
      if (id === SHEET && dev !== undefined) return NUL + SHEET
      return undefined
    },
    async load(id) {
      if (id === NUL + SHEET) return sheetSource(options.sheet)
      if (id !== NUL + VIRTUAL) return undefined
      const href = dev === undefined ? (await build()).href : DEV_PATH
      return `export const href = ${JSON.stringify(href)}`
    },
    async generateBundle() {
      // The browser build comes first, and is the one a host serves files from.
      if (this.environment.name !== 'client') return
      const { css, fileName } = await build()
      this.emitFile({ type: 'asset', fileName, source: css })
    },
  }
}
