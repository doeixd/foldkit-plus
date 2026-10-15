/**
 * Backspace at the start of a heading, broken: `pnpm mutate
 * packages/richtext/test/headingBackspace.mutations.ts` checks that a test fails for it.
 */
export default [
  {
    name: 'a heading joins the block above at once',
    edits: [
      {
        file: '../src/command.ts',
        find: "    if (backward && block.type === 'Heading') {",
        replace: '    if (false) {',
      },
    ],
    tests: [
      'packages/richtext/test/command.test.ts',
      'packages/richtext/test/nestedEditing.test.ts',
    ],
  },
]
