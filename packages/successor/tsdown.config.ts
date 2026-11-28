import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/**/*.ts'],
  unbundle: true,
  fixedExtension: false,
  format: ['esm'],
  dts: true,
  target: 'es2022',
  deps: { neverBundle: [/^\.\.?\//, 'effect', /^@doeixd\/metakit(\/.*)?$/] },
})
