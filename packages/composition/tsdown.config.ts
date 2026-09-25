import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    foldkit: 'src/foldkit/index.ts',
    richtext: 'src/richtext/index.ts',
    appearance: 'src/appearance/index.ts',
    remote: 'src/remote/index.ts',
    surface: 'src/surface/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
})
