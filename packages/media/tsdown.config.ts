import { defineConfig } from 'tsdown'

// One file per source module, relative imports left as written: a page then
// keeps only the modules it reads, as from source (#215). Linked into one file,
// `sideEffects: false` had nothing to drop and `export * as` became an object
// keeping every member. `scripts/test/publishedBuild.test.ts` holds it.
export default defineConfig({
  entry: ['src/**/*.ts'],
  fixedExtension: false,
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  // Not `node`: its runtime chunk carried `import "node:module"` into the
  // browser's (#215). The Node entries import their `node:` modules themselves.
  platform: 'neutral',
  deps: { neverBundle: [/^\.\.?\//, 'vite', '@cloudflare/workers-types'] },
})
