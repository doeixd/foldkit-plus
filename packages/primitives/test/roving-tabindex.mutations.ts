/**
 * Roving tabindex declarations, broken in turn:
 * `pnpm mutate packages/primitives/test/roving-tabindex.mutations.ts`.
 */
const tests = ['packages/primitives/test/roving-tabindex.test.ts']

export default [
  {
    name: 'the container does not declare navigation',
    edits: [
      {
        file: '../src/interaction/roving-tabindex.ts',
        find: "supplies: ['navigation'],\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an item does not declare focus',
    edits: [
      {
        file: '../src/interaction/roving-tabindex.ts',
        find: "supplies: ['focus'],\n",
        replace: '',
      },
    ],
    tests,
  },
]
