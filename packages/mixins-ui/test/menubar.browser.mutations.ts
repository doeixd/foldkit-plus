/**
 * The menubar in a real browser, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/menubar.browser.mutations.ts` checks
 * that the test fails.
 */
const tests = ['packages/mixins-ui/test/menubar.browser.test.ts']

export default [
  {
    name: 'the bar reads the arrows physically right to left',
    edits: [
      {
        file: '../src/menubar.ts',
        find: 'const key = readingKey(pressed, options.direction)',
        replace: 'const key = pressed',
      },
    ],
    tests,
  },
]
