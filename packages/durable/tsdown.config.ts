import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/core.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: ['effect', /^@effect\/sql-sqlite-node/] },
})
