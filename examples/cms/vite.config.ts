import {
  createServer,
  defineConfig,
  type HtmlTagDescriptor,
  type Plugin,
  type ViteDevServer,
} from 'vite'

/** Workspace packages resolve to their source, so an edit shows without a build. */
const conditions = ['foldkit-plus:source']

/** `src/styles/sheet.ts`'s stylesheet, compiled by `server` as the page would compile it. */
const compiled = async (server: ViteDevServer): Promise<string> => {
  const { stylesheet } = await server.ssrLoadModule('/src/styles/sheet.ts')
  if (typeof stylesheet !== 'string') throw new Error('src/styles/sheet.ts exports no stylesheet')
  return stylesheet
}

/**
 * The page's foundations (the reset, the palette, the type) in the HTML, so
 * its first paint already has the theme's background: written by the script
 * instead, each move between the posts, the pages and the site painted white
 * until the script had run. A view's own Styles still arrive as it draws.
 */
const foundations = (): Plugin => ({
  name: 'foundations',
  transformIndexHtml: {
    order: 'pre',
    handler: async (_html, context): Promise<ReadonlyArray<HtmlTagDescriptor>> => {
      // A build has no server to compile with: it starts one of its own.
      const server =
        context.server ??
        (await createServer({
          configFile: false,
          root: import.meta.dirname,
          logLevel: 'error',
          appType: 'custom',
          server: { middlewareMode: true, hmr: false },
          resolve: { conditions },
          ssr: { resolve: { conditions } },
          optimizeDeps: { noDiscovery: true, include: [] },
        }))
      try {
        return [{ tag: 'style', children: await compiled(server), injectTo: 'head' }]
      } finally {
        if (context.server === undefined) await server.close()
      }
    },
  },
})

/**
 * The sandbox's code and its SQLite, asked for with the page rather than after
 * it: otherwise each waits for the one before (the entry, then its import of
 * the sandbox, then the wasm), which on a slow network was most of the wait.
 */
const preloadSandbox = (): Plugin => ({
  name: 'preload-sandbox',
  apply: 'build',
  transformIndexHtml: (_html, context) =>
    Object.values(context.bundle ?? {}).flatMap((file): ReadonlyArray<HtmlTagDescriptor> => {
      const href = `/${file.fileName}`
      if (file.type === 'asset' && file.fileName.endsWith('.wasm'))
        return [
          {
            tag: 'link',
            attrs: { rel: 'preload', as: 'fetch', type: 'application/wasm', crossorigin: '', href },
            injectTo: 'head',
          },
        ]
      if (file.type === 'chunk' && file.isDynamicEntry && file.name === 'browser')
        return [
          { tag: 'link', attrs: { rel: 'modulepreload', crossorigin: '', href }, injectTo: 'head' },
        ]
      return []
    }),
})

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  define: {
    // The deployment the takeover compares, from the `FOLDKIT_BUILD_ID` the
    // build saw. Without the `foldkit` plugin this is the whole of it: a
    // static replacement, and an empty id refuses every page it should adopt.
    'import.meta.env.FOLDKIT_BUILD_ID': JSON.stringify(process.env.FOLDKIT_BUILD_ID ?? ''),
  },
  plugins: [foundations(), preloadSandbox()],
  build: { target: 'es2022' },
  server: {
    host: '127.0.0.1',
    port: 5175,
    // The client posts to `/remote` on its own origin; proxy it to the server.
    proxy: { '/remote': { target: 'http://127.0.0.1:8789' } },
  },
})
