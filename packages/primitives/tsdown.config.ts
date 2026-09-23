import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/device/index.ts',
    'src/dom/index.ts',
    'src/events/index.ts',
    'src/interaction/index.ts',
    'src/media/index.ts',
    'src/motion/index.ts',
    'src/net/index.ts',
    'src/observers/index.ts',
    'src/state/index.ts',
    'src/time/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: ['effect', /^foldkit(\/.*)?$/, 'foldkit-bundle', 'foldkit-mixins'] },
})
