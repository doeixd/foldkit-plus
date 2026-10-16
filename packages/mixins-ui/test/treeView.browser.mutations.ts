/**
 * The tree view in a real browser, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/treeView.browser.mutations.ts` checks
 * that the test fails.
 */
const tests = ['packages/mixins-ui/test/treeView.browser.test.ts']

export default [
  {
    name: 'the tree reads the arrows physically right to left',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'const key = readingKey(pressed, options.direction)',
        replace: 'const key = pressed',
      },
    ],
    tests,
  },
  {
    name: 'the view swaps its keys but draws no direction',
    edits: [
      {
        file: '../src/treeView.ts',
        find: '...(options.direction === undefined ? [] : [h.Dir(options.direction)]),',
        replace: '',
      },
    ],
    tests,
  },
]
