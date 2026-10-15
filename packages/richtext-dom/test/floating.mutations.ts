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
  {
    name: 'a narrow block’s toolbar starts past its left edge',
    edits: [
      {
        file,
        find: 'left: Math.max(target.left, target.left + target.width - gap - floating.width),',
        replace: 'left: target.left + target.width - gap - floating.width,',
      },
    ],
    tests: ['packages/richtext-dom/test/floating.test.ts'],
  },
  {
    name: 'the corner is at the top edge',
    edits: [
      {
        file,
        find: '  top: target.top + gap,\n  left: Math.max',
        replace: '  top: target.top,\n  left: Math.max',
      },
    ],
    tests: ['packages/richtext-dom/test/floating.test.ts'],
  },
]
