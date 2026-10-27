import { foldkit } from '@foldkit/vite-plugin'
import { foundations } from 'foldkit-mixins/foundations'
import { defineConfig } from 'vite'

export default defineConfig({
  // The theme's foundations in the page, so its first paint is already styled;
  // Foldkit's view identity for the differ, and the Model kept across a dev reload.
  plugins: [foundations({ module: '/src/style.ts' }), foldkit()],
  // Workspace packages resolve to their source, so an edit shows without a build;
  // on the server too, which compiles the foundations.
  resolve: { conditions: ['foldkit-plus:source'] },
  ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
  server: { host: '127.0.0.1' },
})
