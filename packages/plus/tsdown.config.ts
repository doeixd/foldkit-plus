import { defineConfig } from 'tsdown'

// Every file under src is an entry point: the root, the CLI, and one
// re-export per package entry point, each built to its own subpath.
export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  platform: 'node',
})
