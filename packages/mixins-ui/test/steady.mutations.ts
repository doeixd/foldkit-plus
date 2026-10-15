/**
 * Weight without reflow, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/steady.mutations.ts`.
 */
export default [
  {
    name: 'a pressed option takes no room for its heavier label',
    edits: [
      {
        file: '../src/recipes/segmented.ts',
        find: "      Utilities.steady('semibold'),\n",
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/steady.browser.test.ts'],
  },
  {
    name: 'the room is taken at the lighter weight',
    edits: [
      {
        file: '../../mixins/src/utilities.ts',
        find: '      fontWeight: t.weight[weight],\n    }),',
        replace: '    }),',
      },
    ],
    tests: ['packages/mixins-ui/test/steady.browser.test.ts'],
  },
  {
    name: 'a card leaves its title out of data-label',
    edits: [
      {
        file: '../src/card.ts',
        find: "builders.title.attrs([h.DataAttribute('label', options.title)])",
        replace: 'builders.title.attrs()',
      },
    ],
    tests: ['packages/mixins-ui/test/card.test.ts'],
  },
  {
    name: "the label's copy is read into the button's name",
    edits: [
      {
        file: '../../mixins/src/utilities.ts',
        find: "      visibility: 'hidden',\n      fontWeight: t.weight[weight],",
        replace: '      fontWeight: t.weight[weight],',
      },
    ],
    tests: ['packages/mixins-ui/test/steady.browser.test.ts'],
  },
]
