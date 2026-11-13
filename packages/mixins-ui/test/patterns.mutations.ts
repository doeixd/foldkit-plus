/**
 * Pattern obligations, broken in turn: `pnpm mutate packages/mixins-ui/test/patterns.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/patterns.test.ts']

export default [
  {
    name: 'a listbox does not ask for navigation',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "obligations: ['navigation'],\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a listbox item does not ask for focus',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "obligations: ['focus'],\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a checkbox does not ask for checked or activation',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "obligations: ['checked', 'activation'],\n",
        replace: '',
      },
    ],
    tests,
  },
]
