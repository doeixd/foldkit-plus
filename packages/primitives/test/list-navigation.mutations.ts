/**
 * List navigation on a text field, and its item half beside a router, broken in turn:
 * `pnpm mutate packages/primitives/test/list-navigation.mutations.ts` checks
 * that a test fails for every one.
 */
const tests = ['packages/primitives/test/list-navigation.test.ts']

export default [
  {
    name: 'an item takes the stop from no current item',
    edits: [
      {
        file: '../src/interaction/list-navigation.ts',
        find: '            input[declared.field].current,',
        replace: '            null,',
      },
    ],
    tests,
  },
  {
    name: 'the item half keeps a tab stop under virtual',
    edits: [
      {
        file: '../src/interaction/list-navigation.ts',
        find: '            args.virtual,\n            focused,',
        replace: '            false,\n            focused,',
      },
    ],
    tests,
  },
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
  {
    name: 'a commit does not declare activation',
    edits: [
      {
        file: '../src/interaction/list-navigation.ts',
        find: "supplies: options.commit === undefined ? ['navigation'] : ['navigation', 'activation'],",
        replace: "supplies: ['navigation'],",
      },
    ],
    tests,
  },
  {
    name: 'an item does not declare focus',
    edits: [
      {
        file: '../src/interaction/list-navigation.ts',
        find: "supplies: ['focus'],",
        replace: 'requires: { capability: Capability.Focusable },',
      },
    ],
    tests,
  },
]
