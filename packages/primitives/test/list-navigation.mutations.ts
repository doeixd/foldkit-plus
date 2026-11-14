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
        find: '...(typeahead ? [Behaviors.Keys.printable] : []),',
        replace: '...[Behaviors.Keys.printable],',
      },
    ],
    tests,
  },
  {
    name: 'Enter commits a disabled current item',
    edits: [
      {
        file: '../src/interaction/list-navigation.ts',
        find: 'currentIndex !== -1 && !items.isDisabled(currentIndex)',
        replace: 'currentIndex !== -1',
      },
    ],
    tests,
  },
  {
    name: 'Enter does not commit the current item',
    edits: [
      {
        file: '../src/interaction/list-navigation.ts',
        find: "key === 'Enter' && options.commit",
        replace: "key === 'Enter' && false && options.commit",
      },
    ],
    tests,
  },
]
