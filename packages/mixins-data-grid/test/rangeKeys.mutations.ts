/**
 * Range and focus keys pressed before a frame, broken in turn: `pnpm mutate
 * packages/mixins-data-grid/test/rangeKeys.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-data-grid/test/rangeKeys.browser.test.ts']

export default [
  {
    name: 'a key reads the range and focus as drawn, not as the key before left them',
    edits: [
      {
        file: '../src/view.ts',
        find: 'pending !== undefined && sameBasis(pending.drawn, drawnBasis) ? pending.now : drawnBasis',
        replace: 'drawnBasis',
      },
    ],
    tests,
  },
  {
    name: 'a plain arrow reads the focus as drawn',
    edits: [
      {
        file: '../src/view.ts',
        find: 'current: keyBasis().focus,',
        replace: 'current: state.focus.current,',
      },
    ],
    tests,
  },
  {
    name: 'a burst outlives the frame that shows it',
    edits: [
      {
        file: '../src/view.ts',
        find: 'if (pending !== undefined && !sameBasis(pending.drawn, drawnBasis)) pending = undefined',
        replace: '',
      },
    ],
    tests,
  },
]
