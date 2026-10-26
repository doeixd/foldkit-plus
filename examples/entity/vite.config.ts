import { foldkit } from '@foldkit/vite-plugin'
import { foundations } from 'foldkit-mixins/foundations'
import { defineConfig } from 'vite'

export default defineConfig({
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
  // The theme's foundations in the page, so its first paint is already styled.
  plugins: [foundations({ module: '/src/style.ts' }), foldkit()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    // The client posts to `/remote` on its own origin; proxy it to the server.
    proxy: { '/remote': { target: 'http://127.0.0.1:8788' } },
  },
})
