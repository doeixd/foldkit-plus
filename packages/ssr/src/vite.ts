/**
 * `foldkit-ssr/vite`: the static half of a build, as a Vite plugin. After
 * Vite writes the client bundle, `staticSite` renders every path with
 * `SSR.generate` and writes each page where a static host serves its
 * address, with the sitemap and `robots.txt` beside them. It owns no build:
 * it runs as a `closeBundle` step on the application's own client build,
 * with the application's own template.
 *
 * The application describes its site in a module the plugin evaluates
 * through a server (workspace packages resolve to source, as the build
 * does), so `vite.config.ts` names a file, never application code.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { Effect, Schema } from 'effect'
import type { RenderError } from 'foldkit/experimental/server'
import type { Plugin } from 'vite'
import { SSR, type Head, type ResumeUnsafe } from './index.js'
import type { ResumableConfig, ResumePlan } from './shared.js'

/** What a page adds to its head, given what it rendered: for site descriptions. */
export type { Head }

/** A path the site generates, with the date its sitemap names when it has one. */
export type SitePath = string | { readonly path: string; readonly modified?: string | undefined }

const pathOf = (spec: SitePath): string => (typeof spec === 'string' ? spec : spec.path)
const modifiedOf = (spec: SitePath): string | undefined =>
  typeof spec === 'string' ? undefined : spec.modified

/**
 * The file a static host serves for a path. `directory` is the package's
 * own layout (`/about` as `about/index.html`); `flat` writes `about.html`,
 * for hosts with clean addresses and no directory indexes.
 */
export const fileFor = (path: string, layout: 'directory' | 'flat'): string => {
  const trimmed = path.replace(/^\/+/, '').replace(/\/+$/, '')
  if (trimmed === '') return 'index.html'
  if (layout === 'flat') return `${trimmed}.html`
  return trimmed.endsWith('.html') ? trimmed : `${trimmed}/index.html`
}

/**
 * What a static site is: everything `SSR.generate` takes, plus where its
 * pages land. `config` may read the path (a site whose Model is prepared
 * per page satisfies and returns its own config for it); `paths` may be a
 * function of the prepared data (a site that lists its pages from what it
 * serves). `template` is the built shell the pages are rendered into;
 * `files` is the host's layout; `sitemap` and `robots` write their files
 * from the generated pages.
 */
export interface StaticSite<
  Model,
  Fields extends Schema.Struct.Fields,
  Message,
  Resolved = ResumableConfig<Model, Message>,
> {
  readonly config: Resolved | ((path: string) => Resolved | Promise<Resolved>)
  readonly plan: ResumePlan<Model, Fields>
  readonly buildId?: string | undefined
  readonly origin: string
  readonly paths:
    ReadonlyArray<SitePath> | (() => ReadonlyArray<SitePath> | Promise<ReadonlyArray<SitePath>>)
  readonly template: string
  readonly head?: Head | undefined
  readonly flags?: ((path: string) => unknown) | undefined
  readonly files?: 'directory' | 'flat' | undefined
  readonly sitemap?: boolean | undefined
  readonly robots?: boolean | undefined
}

/** One generated page, with the file the host serves it from. */
export interface BuiltPage {
  readonly path: string
  readonly file: string
  readonly html: string
  readonly modified?: string | undefined
}

/** What a static site build produced: its pages, and its sitemap and robots text. */
export interface BuiltSite {
  readonly pages: ReadonlyArray<BuiltPage>
  readonly sitemap?: string | undefined
  readonly robots?: string | undefined
}

/**
 * Renders a static site: every path through `SSR.generate`, one page per
 * path in order, with the sitemap and robots text the options ask for. A
 * build id must never be a secret, and two deployments must never share
 * one; empty is refused with the deployment's name missing.
 */
export const generateStaticSite = <Model, Fields extends Schema.Struct.Fields, Message = any>(
  site: StaticSite<Model, Fields, Message>,
): Effect.Effect<BuiltSite, RenderError | ResumeUnsafe> => {
  const buildId = site.buildId ?? process.env.FOLDKIT_BUILD_ID ?? ''
  if (buildId === '') {
    throw new Error(
      'set FOLDKIT_BUILD_ID to the deployment this build belongs to, the same value `vite build` saw',
    )
  }
  return Effect.gen(function* () {
    // Read into locals first: a call inside the thunks below would lose the
    // narrowing of a property access.
    const pathsInput = site.paths
    const specs =
      typeof pathsInput === 'function'
        ? yield* Effect.promise(() => Promise.resolve(pathsInput()))
        : pathsInput
    const files = site.files ?? 'directory'
    const configInput = site.config
    const pages: Array<BuiltPage> = []
    for (const spec of specs) {
      const path = pathOf(spec)
      const config =
        typeof configInput === 'function'
          ? yield* Effect.promise(async () => configInput(path))
          : configInput
      const [page] = yield* SSR.generate(config, site.plan, {
        buildId,
        template: site.template,
        origin: site.origin,
        paths: [path] as const,
        ...(site.flags === undefined ? {} : { flags: site.flags }),
        ...(site.head === undefined ? {} : { head: site.head }),
      })
      pages.push({
        path,
        file: fileFor(path, files),
        html: page.html,
        ...(modifiedOf(spec) === undefined ? {} : { modified: modifiedOf(spec) }),
      })
    }
    return {
      pages,
      ...(site.sitemap === true ? { sitemap: SSR.sitemap(pages, { origin: site.origin }) } : {}),
      ...(site.robots === true ? { robots: SSR.robots({ origin: site.origin }) } : {}),
    }
  })
}

/** A site description as a module exports it, for the plugin to evaluate. */
export interface SiteModule {
  readonly config:
    | ResumableConfig<any, any>
    | ((path: string) => ResumableConfig<any, any> | Promise<ResumableConfig<any, any>>)
  readonly plan: ResumePlan<any, any>
  readonly buildId?: string | undefined
  readonly origin: string
  readonly paths:
    ReadonlyArray<SitePath> | (() => ReadonlyArray<SitePath> | Promise<ReadonlyArray<SitePath>>)
  readonly template?: ((built: string) => string) | undefined
  readonly head?: Head | undefined
  readonly flags?: ((path: string) => unknown) | undefined
  readonly files?: 'directory' | 'flat' | undefined
  readonly sitemap?: boolean | undefined
  readonly robots?: boolean | undefined
}

/** Workspace packages resolve to their source, so the site builds as edited. */
const conditions = ['foldkit-plus:source']

/**
 * A static site as a Vite plugin: after the client bundle is written, the
 * site module is evaluated, every path is rendered into the built shell,
 * and the pages land in the output beside the sitemap and robots text.
 * The config names the module, never application code, so nothing resolves
 * through a stale build.
 */
export const staticSite = (options: {
  /** The site description's module, root-relative (`/src/site.ts`), and its export. */
  readonly site: { readonly module: string; readonly export?: string | undefined }
  /** What `vite build` wrote: defaults to the resolved `build.outDir`. */
  readonly outDir?: string | undefined
}): Plugin => {
  let outDir = options.outDir ?? 'dist'
  let root = process.cwd()
  return {
    name: 'foldkit-ssr',
    apply: 'build',
    configResolved(config) {
      // The site module resolves against the application, not this process:
      // the test runs from the workspace root while the site lives elsewhere.
      root = config.root
      if (options.outDir === undefined)
        outDir = isAbsolute(config.build.outDir)
          ? config.build.outDir
          : resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      // No dev server runs during a build: one of its own, closed after.
      // `vite` loads only here, never by a page: a build without it fails
      // naming the package, not with a resolution error.
      const { createServer } = await import('vite').catch(() => {
        throw new Error("foldkit-ssr/vite needs the 'vite' package: add it where the build runs")
      })
      const server = await createServer({
        configFile: false,
        root,
        logLevel: 'error',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false },
        resolve: { conditions },
        ssr: { resolve: { conditions } },
        optimizeDeps: { noDiscovery: true, include: [] },
      })
      try {
        const exported = await server.ssrLoadModule(options.site.module)
        const site = exported[options.site.export ?? 'site'] as SiteModule
        if (site === undefined || site === null || typeof site !== 'object')
          throw new Error(
            `foldkit-ssr: ${options.site.module} exports no ${options.site.export ?? 'site'} site description`,
          )
        const shell = join(outDir, 'index.html')
        let built: string
        try {
          built = await readFile(shell, 'utf8')
        } catch {
          // Rollup runs closeBundle after a failed client build too: name
          // the missing shell instead of its ENOENT.
          throw new Error(
            `foldkit-ssr: no built index.html at ${shell}: the client build failed or outDir is wrong`,
          )
        }
        const result = await Effect.runPromise(
          generateStaticSite({
            ...site,
            template: site.template?.(built) ?? built,
          }),
        )
        for (const page of result.pages) {
          const file = join(outDir, page.file)
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, page.html)
        }
        if (result.sitemap !== undefined)
          await writeFile(join(outDir, 'sitemap.xml'), result.sitemap)
        if (result.robots !== undefined) await writeFile(join(outDir, 'robots.txt'), result.robots)
        console.log(
          `foldkit-ssr: generated ${result.pages.length} pages${result.sitemap === undefined ? '' : ', a sitemap'}${result.robots === undefined ? '' : ' and robots.txt'} into ${outDir}`,
        )
      } finally {
        await server.close()
      }
    },
  }
}
