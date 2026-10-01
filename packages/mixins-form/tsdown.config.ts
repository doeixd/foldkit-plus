import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/ui.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: {
    neverBundle: [
      'effect',
      'foldkit',
      'foldkit-bundle',
      'foldkit-form',
      'foldkit-mixins',
      'foldkit-mixins-ui',
    ],
  },
})
