/**
 * Floating elements, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/floating.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/floating.ts'
const tests = ['packages/richtext-dom/test/floating.browser.test.ts']

export default [
  {
    name: 'an element’s own size is not watched',
    edits: [{ file, find: '  sizes?.observe(element)\n', replace: '' }],
    tests,
  },
]
