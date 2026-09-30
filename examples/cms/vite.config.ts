import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite'
import { foundations } from 'foldkit-mixins/foundations'
import { staticSite } from 'foldkit-ssr/vite'

/** Workspace packages resolve to their source, so an edit shows without a build. */
const conditions = ['foldkit-plus:source']

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
  plugins: [
    // The page's foundations in the HTML, so its first paint already has the
    // theme's background; the site's pages beside the bundle, rendered from
    // the seed after it is written.
    foundations({ module: '/src/styles/sheet.ts' }),
    staticSite({ site: { module: '/src/ssr/siteBuild.ts' } }),
    preloadSandbox(),
  ],
  build: { target: 'es2022' },
  server: {
    host: '127.0.0.1',
    port: 5175,
    // The client posts to `/remote` on its own origin; proxy it to the server.
    proxy: { '/remote': { target: 'http://127.0.0.1:8789' } },
  },
})
