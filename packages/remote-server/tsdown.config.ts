import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/port.ts', 'src/fetch.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: ['effect', 'foldkit', 'foldkit-remote'] },
})
