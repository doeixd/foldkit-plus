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
        find: "key === 'Enter' &&\n",
        replace: "key === 'Enter' && false &&\n",
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
