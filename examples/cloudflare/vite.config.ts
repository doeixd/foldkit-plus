import { foldkit } from '@foldkit/vite-plugin'
import { foundations } from 'foldkit-mixins/foundations'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: { conditions: ['foldkit-plus:source'] },
  ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
  // The theme's foundations in the page, so its first paint is already styled.
  plugins: [foundations({ module: '/src/style.ts' }), foldkit()],
  // `_worker.js` is copied into the build. `emptyOutDir` would otherwise delete it.
  publicDir: 'pages/static',
  build: {
    outDir: 'pages/public',
    emptyOutDir: true,
  },
})
