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
      'drizzle-orm',
      'foldkit-cms',
      'foldkit-entity',
      'foldkit-remote',
      'foldkit-remote-drizzle',
      'foldkit-remote-server',
    ],
  },
})
