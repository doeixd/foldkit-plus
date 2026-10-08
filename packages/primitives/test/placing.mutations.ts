/**
 * Viewport placing, broken in turn:
 * `pnpm mutate packages/primitives/test/placing.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/primitives/test/placing.test.ts']

export default [
  {
    name: 'overflow shifts right, off the window',
    edits: [
      {
        file: '../src/interaction/placing.ts',
        find: 'dx: over > 0 ? -over : 0,',
        replace: 'dx: over > 0 ? over : 0,',
      },
    ],
    tests,
  },
  {
    name: 'the panel never flips',
    edits: [
      {
        file: '../src/interaction/placing.ts',
        find: 'flip: rect.bottom > viewport.height && rect.top - margin >= rect.height,',
        replace: 'flip: false,',
      },
    ],
    tests,
  },
]
