import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    foldkit: 'src/foldkit/index.ts',
    richtext: 'src/richtext/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
})
