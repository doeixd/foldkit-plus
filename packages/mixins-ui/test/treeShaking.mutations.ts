/**
 * The package's build, broken: `pnpm mutate packages/mixins-ui/test/treeShaking.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/treeShaking.test.ts']

export default [
  {
    name: 'the build links its modules, so Recipes becomes one object reaching every recipe',
    edits: [{ file: '../tsdown.config.ts', find: '      /^\\.\\.?\\//,\n', replace: '' }],
    tests,
  },
  {
    name: 'the files are written .mjs while they import each other as .js',
    edits: [{ file: '../tsdown.config.ts', find: '  fixedExtension: false,\n', replace: '' }],
    tests,
  },
]
