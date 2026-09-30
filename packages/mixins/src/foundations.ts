/**
 * `foldkit-mixins/foundations`: the page's foundations (the reset, the
 * palette, the type) in the HTML, so its first paint already has the
 * theme's background. A view's own Styles still arrive as it draws; this is
 * the one stylesheet that belongs to no view.
 *
 * The stylesheet is compiled from a module the application owns, through a
 * server, as the page would compile it — so the build's foundations are the
 * application's, not a copy. `vite` is loaded only here, never by a page:
 * this subpath is node-only, and a page that imports it by mistake fails
 * fast naming `vite`.
 */
import type { HtmlTagDescriptor, Plugin, ViteDevServer } from 'vite'

/** Workspace packages resolve to their source, so the foundations build as edited. */
const conditions = ['foldkit-plus:source']

const loadVite = async (): Promise<typeof import('vite')> => {
  try {
    return await import('vite')
  } catch {
    throw new Error(
      "foldkit-mixins/foundations needs the 'vite' package: add it where the build runs",
    )
  }
}

/** The stylesheet text a loaded module holds, or a refusal naming the export. */
const readStylesheet = (
  exported: Record<string, unknown>,
  module: string,
  name: string,
): string => {
  const stylesheet = exported[name]
  if (typeof stylesheet !== 'string')
    throw new Error(`foldkit-mixins/foundations: ${module} exports no ${name} stylesheet`)
  return stylesheet
}

/**
 * Compiles the stylesheet a module exports: what the page's first paint is
 * styled with before any script runs. The module is evaluated, so it must be
 * pure (building a string, like the CMS example's sheet).
 */
export const loadFoundations = async (options: {
  /** The stylesheet module, root-relative (`/src/styles/sheet.ts`). */
  readonly module: string
  /** The export holding the stylesheet text. Default `stylesheet`. */
  readonly export?: string | undefined
  /** What `vite build` runs from. Default the current directory. */
  readonly root?: string | undefined
}): Promise<string> => {
  const { createServer } = await loadVite()
  const server = await createServer({
    configFile: false,
    root: options.root ?? process.cwd(),
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    resolve: { conditions },
    ssr: { resolve: { conditions } },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    return readStylesheet(
      (await server.ssrLoadModule(options.module)) as Record<string, unknown>,
      options.module,
      options.export ?? 'stylesheet',
    )
  } finally {
    await server.close()
  }
}

/**
 * Writes the foundations into the page's head: in development through the
 * running server, in a build through one of its own. Without it, each move
 * between pages paints unstyled until the script runs.
 */
export const foundations = (options: {
  /** The stylesheet module, root-relative (`/src/styles/sheet.ts`). */
  readonly module: string
  /** The export holding the stylesheet text. Default `stylesheet`. */
  readonly export?: string | undefined
  /** What `vite build` runs from. Default the current directory. */
  readonly root?: string | undefined
}): Plugin => ({
  name: 'foldkit-foundations',
  transformIndexHtml: {
    order: 'pre',
    handler: async (
      _html,
      context: { readonly server?: ViteDevServer | undefined },
    ): Promise<Array<HtmlTagDescriptor>> => {
      const stylesheet =
        context.server === undefined
          ? await loadFoundations({
              module: options.module,
              export: options.export,
              root: options.root,
            })
          : readStylesheet(
              (await context.server.ssrLoadModule(options.module)) as Record<string, unknown>,
              options.module,
              options.export ?? 'stylesheet',
            )
      return [{ tag: 'style', children: stylesheet, injectTo: 'head' as const }]
    },
  },
})
