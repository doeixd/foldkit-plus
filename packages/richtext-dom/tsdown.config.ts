import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/host.ts',
    'src/events.ts',
    'src/html.ts',
    'src/view.ts',
    'src/editor.ts',
    'src/editor-bundle.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: ['effect', /^foldkit(\/.*)?$/, 'foldkit-richtext'] },
})
