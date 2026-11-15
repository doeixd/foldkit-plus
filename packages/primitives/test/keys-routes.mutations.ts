/**
 * The navigation primitives' routes, broken in turn:
 * `pnpm mutate packages/primitives/test/keys-routes.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/primitives/test/keys-routes.test.ts']

export default [
  {
    name: 'a navigation key taken only with Shift up',
    edits: [
      {
        file: '../../mixins/src/behaviors/keys.ts',
        find: '[chord(key, { ...modifiers, shift: false }), chord(key, { ...modifiers, shift: true })] as const',
        replace: '[chord(key, { ...modifiers, shift: false })] as const',
      },
    ],
    tests,
  },
  {
    name: 'a virtual list still moves focus',
    edits: [
      {
        file: '../src/interaction/list-navigation.ts',
        find: 'args.virtual || id === null ? message',
        replace: 'id === null ? message',
      },
    ],
    tests,
  },
  {
    name: 'a roving container moves focus under virtual',
    edits: [
      {
        file: '../src/interaction/roving-tabindex.ts',
        find: 'args.virtual ? wrap(id) : Behaviors.Keys.focus(id, wrap(id))',
        replace: 'Behaviors.Keys.focus(id, wrap(id))',
      },
    ],
    tests,
  },
  {
    name: 'the grid forgets Ctrl+Home and Ctrl+End',
    edits: [
      {
        file: '../src/interaction/grid-navigation.ts',
        find: "...Behaviors.Keys.withShift('End', { ctrl: true }),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the tree does not declare its arrows',
    edits: [
      {
        file: '../src/interaction/tree-navigation.ts',
        find: "        ...Behaviors.Keys.withShift('End'),\n        ...arrowChords('both'),\n",
        replace: "        ...Behaviors.Keys.withShift('End'),\n",
      },
    ],
    tests,
  },
  {
    name: 'a space with an empty query is typed',
    edits: [
      {
        file: '../src/interaction/typeahead.ts',
        find: "if (key === ' ' && query === '') return Option.none()",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a character outside the BMP is not printable',
    edits: [
      {
        file: '../src/interaction/typeahead.ts',
        find: 'Behaviors.Keys.matches(Behaviors.Keys.printable, key, modifiers)',
        replace:
          'key.length === 1 && !modifiers.ctrlKey && !modifiers.altKey && !modifiers.metaKey',
      },
    ],
    tests,
  },
  {
    name: 'a list with typeahead off still declares every printable key',
    edits: [
      {
        file: '../src/interaction/list-navigation.ts',
        find: '...(typeahead ? [Behaviors.Keys.printable] : []),',
        replace: '...[Behaviors.Keys.printable],',
      },
    ],
    tests,
  },
]
