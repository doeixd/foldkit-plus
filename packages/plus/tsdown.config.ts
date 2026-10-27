import { defineConfig } from 'tsdown'

export default defineConfig([
  // Every file under src is an entry point: the root and one re-export per
  // package entry point, each built to its own subpath.
  {
    entry: ['src/**/*.ts', '!src/cli.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    target: 'es2022',
    platform: 'node',
  },
  // The CLI carries Effect inside it. npx can run it with no peers installed
  // (`--legacy-peer-deps`), and Node would then load whatever `effect` an
  // ancestor folder holds: an Effect 3 crashed it before it printed a word.
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'es2022',
    platform: 'node',
    deps: { alwaysBundle: ['effect'] },
  },
])
