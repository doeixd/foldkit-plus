import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/html.ts', 'src/image.ts', 'src/ui.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: {
    neverBundle: [
      'effect',
      'foldkit',
      '@foldkit/ui',
      'foldkit-bundle',
      'foldkit-crud',
      'foldkit-form',
      'foldkit-media',
      'foldkit-mixins',
      'foldkit-mixins-form',
      'foldkit-mixins-ui',
    ],
  },
})
