import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: {
    neverBundle: [/^foldkit(\/.*)?$/, 'foldkit-mixins', 'foldkit-richtext', 'foldkit-richtext-dom'],
  },
})
