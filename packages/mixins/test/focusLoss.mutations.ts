/**
 * `test-support/focusLoss.mjs`, broken in turn:
 * `pnpm mutate packages/mixins/test/focusLoss.mutations.ts`.
 */
const file = '../../../test-support/focusLoss.mjs'
const tests = ['packages/mixins/test/focusLoss.browser.test.ts']

export default [
  {
    name: 'a removal is recorded whether or not it holds the focused node',
    edits: [{ file, find: 'removed.contains(focused)', replace: 'true' }],
    tests,
  },
  {
    name: 'Element.remove is not watched',
    edits: [{ file, find: '    note(this.parentNode, this)\n', replace: '' }],
    tests,
  },
  {
    name: 'replaceChild is not watched',
    edits: [{ file, find: '    note(this, old)\n', replace: '' }],
    tests,
  },
  {
    name: 'dispose leaves removeChild patched',
    edits: [{ file, find: '      Node.prototype.removeChild = removeChild\n', replace: '' }],
    tests,
  },
]
