import { defineConfig } from 'tsdown'

// One file per source module, so a page reading `Metadata` keeps no `Evidence`
// (and none of Effect's `Data`): linked into one file, `sideEffects: false`
// would have nothing to drop (#215).
export default defineConfig({
  entry: ['src/**/*.ts'],
  fixedExtension: false,
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: [/^\.\.?\//, 'effect'] },
})
