/**
 * The header's finger targets, broken in turn: `pnpm mutate packages/mixins-data-grid/test/targets.mutations.ts`.
 */
const file = '../src/style.ts'
const tests = ['packages/mixins-data-grid/test/menu.browser.test.ts']

export default [
  {
    name: 'a column menu button is only as big as its glyph',
    edits: [
      {
        file,
        find: "        minBlockSize: '1.5rem',\n        minInlineSize: '1.5rem',\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a sort label is only as tall as its words',
    edits: [
      {
        file,
        find: "        // A finger's target in height; its width is the label's.\n        minBlockSize: '1.5rem',\n",
        replace: '',
      },
    ],
    tests,
  },
]
