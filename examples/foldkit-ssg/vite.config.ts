import { defineConfig, type Plugin } from 'vite'
import { foldkit } from '@foldkit/vite-plugin'
import { staticSite } from 'foldkit-ssr/vite'

/**
 * `vite preview` as a static host serves the build: `/about` is the page
 * generated at `about/index.html`, and an address with no page is a 404. Vite
 * would otherwise answer `/about` with `index.html`, the home page, which the
 * browser refuses to take over at `/about`.
 */
const staticHost = (): Plugin => ({
  name: 'static-host',
  configurePreviewServer: server => {
    server.middlewares.use((request, _response, next) => {
      const [path = '/', query] = (request.url ?? '/').split('?')
      if (!path.endsWith('/') && !path.split('/').at(-1)?.includes('.'))
        request.url = `${path}/${query === undefined ? '' : `?${query}`}`
      next()
    })
  },
})

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
  ],
  appType: isPreview === true ? 'mpa' : 'spa',
}))
