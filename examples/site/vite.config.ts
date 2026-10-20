import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import { foldkit } from '@foldkit/vite-plugin'
import { staticSite } from 'foldkit-ssr/vite'

/**
 * `vite preview` as a static host serves the build as Cloudflare Pages does:
 * `/about` is the page generated at `about.html`, and an address with no page
 * is a 404. Vite would otherwise answer `/about` with `index.html`, the home
 * page, which the browser refuses to take over at `/about`.
 */
const staticHost = (): Plugin => ({
  name: 'static-host',
  configurePreviewServer: server => {
    server.middlewares.use((request, _response, next) => {
      const [path = '/', query] = (request.url ?? '/').split('?')
      if (path !== '/' && !path.split('/').at(-1)?.includes('.'))
        request.url = `${path.replace(/\/$/, '')}.html${query === undefined ? '' : `?${query}`}`
      next()
    })
  },
})

/**
 * The dev server's pages get the head the build writes through `site.ts`: the
 * reader's scheme and theme, applied before the first paint. Foldkit's dev
 * entry has no head of its own to write to (foldkit#1448), so the template
 * carries it.
 */
const devHead = (): Plugin => {
  let server: ViteDevServer | undefined
  return {
    name: 'dev-head',
    apply: 'serve',
    configureServer: devServer => {
      server = devServer
    },
    transformIndexHtml: async html => {
      if (server === undefined) return html
      const { headScripts } = await server.ssrLoadModule('/src/head.ts')
      if (typeof headScripts !== 'string') throw new Error('src/head.ts exports no headScripts')
      return html.replace('</head>', `${headScripts}</head>`)
    },
  }
}

export default defineConfig(({ isPreview }) => ({
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
  server: { host: '127.0.0.1' },
  // The dev server renders each page through `src/entry.server.ts`, so
  // development serves the same pages the build generates; `FOLDKIT_BUILD_ID`
  // in the environment names the build, as it does for `vite build`. After
  // the client bundle is written, `staticSite` renders every path in
  // `src/site.ts` into the built shell, writing the pages, the sitemap and
  // `robots.txt` beside them.
  plugins: [
    foldkit({ ssr: { serverEntry: '/src/entry.server.ts' } }),
    staticSite({ site: { module: '/src/site.ts' } }),
    staticHost(),
    devHead(),
  ],
  appType: isPreview === true ? 'mpa' : 'spa',
}))
