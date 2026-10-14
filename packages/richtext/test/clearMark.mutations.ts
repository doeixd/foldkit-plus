/**
 * `ClearMark` by value, broken: `pnpm mutate packages/richtext/test/clearMark.mutations.ts`
 * checks that a test fails for it.
 */
export default [
  {
    name: 'a value clears every run with the mark’s name',
    edits: [
      {
        file: '../src/command.ts',
        find: 'entry.run.marks.some(held => sameMark(held, mark)),',
        replace: 'true,',
      },
    ],
    tests: ['packages/richtext/test/clearMark.test.ts'],
  },
]
