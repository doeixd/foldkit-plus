/**
 * List navigation on a text field, broken in turn:
 * `pnpm mutate packages/primitives/test/list-navigation.mutations.ts` checks
 * that a test fails for every one.
 */
const tests = ['packages/primitives/test/list-navigation.test.ts']

export default [
  {
    name: 'a text field still swallows printable keys',
    edits: [
      {
        file: '../src/interaction/list-navigation.ts',
        find: "if (!typeahead && result !== undefined && result._tag === 'Type') return Option.none()\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Enter does not commit the current item',
    edits: [
      {
        file: '../src/interaction/list-navigation.ts',
        find: "key === 'Enter' &&\n",
        replace: "key === 'Enter' && false &&\n",
      },
    ],
    tests,
  },
]
