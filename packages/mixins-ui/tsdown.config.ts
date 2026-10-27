import { defineConfig } from 'tsdown'

// One output file per source file, each importing its neighbours rather than
// linking them. Linked, rolldown turns `export * as Recipes` into an object
// whose getters reach every recipe, so a page using `Recipes.Avatar` shipped
// all of them, @foldkit/ui and floating-ui included (#241). Kept as ESM
// namespaces, an application's bundler drops what it does not read.
export default defineConfig({
  entry: ['src/**/*.ts'],
  unbundle: true,
  // `.js`, as the source's own specifiers name the files they import.
  fixedExtension: false,
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: {
    neverBundle: [
      /^\.\.?\//,
      'effect',
      /^foldkit(\/.*)?$/,
      'foldkit-mixins',
      'foldkit-media',
      '@foldkit/ui',
    ],
  },
})
