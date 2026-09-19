import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: {
    neverBundle: [
      'effect',
      'foldkit',
      'foldkit-bundle',
      'foldkit-entity',
      'foldkit-form',
      'foldkit-remote',
      'foldkit-surface',
    ],
  },
})
