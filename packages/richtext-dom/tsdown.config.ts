import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/host.ts', 'src/events.ts', 'src/html.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: ['foldkit-richtext'] },
})
