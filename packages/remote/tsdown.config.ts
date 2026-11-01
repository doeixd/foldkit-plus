import { defineConfig } from 'tsdown'

// One file per source module, relative imports left as written: a page then
// keeps only the modules it reads, as from source (#215), and the `Remote`
// namespace stays a namespace, so a page keeps only the members it calls
// (#396). Linked, `sideEffects: false` had nothing to drop, and a namespace
// became an object keeping every member. `scripts/test/publishedBuild.test.ts`
// and `scripts/test/readOnlyPage.test.ts` hold it.
export default defineConfig({
  entry: ['src/**/*.ts'],
  fixedExtension: false,
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: {
    neverBundle: [/^\.\.?\//, 'effect', 'foldkit', 'foldkit-entity', 'foldkit-surface'],
  },
})
