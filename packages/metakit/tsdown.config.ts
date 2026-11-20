import { defineConfig } from 'tsdown'

// One file per source module, so a page that reads `Num.lte` keeps the
// operator modules it names and nothing of `sql`, `prove` or `conformance`;
// `z3-solver` is never bundled, and `prove` imports it only when Tier 3 leaves
// a goal undecided.
export default defineConfig({
  entry: ['src/**/*.ts'],
  unbundle: true,
  fixedExtension: false,
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: [/^\.\.?\//, 'effect', 'z3-solver'] },
})
