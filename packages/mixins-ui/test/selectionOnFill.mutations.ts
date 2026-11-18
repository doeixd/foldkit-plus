/**
 * Each recipe's selection on the accent's fill, taken away in turn:
 * `pnpm mutate packages/mixins-ui/test/selectionOnFill.mutations.ts` checks
 * that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/selectionOnFill.browser.test.ts']
const find = "'--fk-selection-background': ref.selection['fill-background'],"

export default [
  {
    name: 'a solid Badge keeps the default selection',
    edits: [{ file: '../src/recipes/badge.ts', find, replace: '' }],
    tests,
  },
  {
    name: 'a bold Alert keeps the default selection',
    edits: [{ file: '../src/recipes/alert.ts', find, replace: '' }],
    tests,
  },
  {
    name: 'an accent ChatMessage bubble keeps the default selection',
    edits: [{ file: '../src/recipes/chatMessage.ts', find, replace: '' }],
    tests,
  },
]
