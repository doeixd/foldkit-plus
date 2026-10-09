import { defineConfig } from 'vite'

export default defineConfig({
  resolve: { conditions: ['foldkit-plus:source'] },
  // `_worker.js` is copied into the build. `emptyOutDir` would otherwise delete it.
  publicDir: 'pages/static',
  build: {
    outDir: 'pages/public',
    emptyOutDir: true,
  },
})
