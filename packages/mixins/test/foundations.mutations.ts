/**
 * The foundations plugin, broken: `pnpm mutate packages/mixins/test/foundations.mutations.ts`.
 */
const file = '../src/foundations.ts'
const tests = ['packages/mixins/test/foundations.test.ts']

export default [
  {
    name: 'a build compiles the sheet from the current directory, not the root Vite resolved',
    edits: [{ file, find: 'root: options.root ?? resolvedRoot,', replace: 'root: options.root,' }],
    tests,
  },
]
