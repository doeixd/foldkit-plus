import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts', 'src/drizzle.ts', 'src/agent.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: {
    neverBundle: [
      'effect',
      'foldkit-entity',
      'foldkit-metadata',
      'foldkit-remote',
      'foldkit-remote-server',
      'foldkit-remote-drizzle',
      'drizzle-orm',
    ],
  },
})
