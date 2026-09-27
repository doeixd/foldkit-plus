import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite'

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
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  plugins: [preloadSandbox()],
  build: { target: 'es2022' },
  server: {
    host: '127.0.0.1',
    port: 5175,
    // The client posts to `/remote` on its own origin; proxy it to the server.
    proxy: { '/remote': { target: 'http://127.0.0.1:8789' } },
  },
})
