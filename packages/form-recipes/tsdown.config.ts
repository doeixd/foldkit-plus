import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/html.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: {
    neverBundle: ['effect', 'foldkit', 'foldkit-crud', 'foldkit-form', 'foldkit-mixins-form'],
  },
})
