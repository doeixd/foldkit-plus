/**
 * The plain-HTML defaults, broken in turn:
 * `pnpm mutate packages/mixins/test/defaults.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/defaults.ts'
const tests = ['packages/mixins/test/defaults.browser.test.ts']

export default [
  {
    name: 'native controls keep the browser’s color',
    edits: [{ file, find: ";accent-color:${v('accent-default', 'auto')}", replace: '' }],
    tests,
  },
  {
    name: 'a rule keeps the browser’s inset line',
    edits: [{ file, find: '`:where(hr){border:0;', replace: '`:where(hr){' }],
    tests,
  },
  {
    name: 'a key is drawn flat',
    edits: [{ file, find: 'border-block-end-width:2px;', replace: '' }],
    tests,
  },
  {
    name: 'an aria-disabled button lights under the pointer',
    edits: [
      {
        file,
        find: '[type=reset]):hover:not([aria-disabled=true]){background:',
        replace: '[type=reset]):hover{background:',
      },
    ],
    tests,
  },
  {
    name: 'an aria-disabled button is not dimmed',
    edits: [{ file, find: ',button[aria-disabled=true]){opacity:0.5', replace: '){opacity:0.5' }],
    tests,
  },
]
