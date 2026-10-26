/**
 * A key of any number of literals, broken in turn: `pnpm mutate packages/form/test/choices.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/form/test/choices.test.ts']

export default [
  {
    name: 'a choice that must hold one is tried only with what no literal is',
    edits: [
      {
        file,
        find: 'control.data.options.map((_, index) => control.data.options.slice(0, index + 1))',
        replace: '[]',
      },
    ],
    tests,
  },
]
