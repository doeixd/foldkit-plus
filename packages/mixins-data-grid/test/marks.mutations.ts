/**
 * The shared cell marks and their legend, each broken in turn: `pnpm mutate
 * packages/mixins-data-grid/test/marks.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/mixins-data-grid/test/marks.test.ts']

export default [
  {
    name: 'no outline where colours are forced',
    edits: [
      {
        file: '../src/marks.ts',
        find: "'@media (forced-colors: active)',",
        replace: "'@media (prefers-contrast: more)',",
      },
    ],
    tests,
  },
  {
    name: 'the swatches are not painted by the marks',
    edits: [{ file: '../src/marks.ts', find: '      marked,\n', replace: '' }],
    tests,
  },
  {
    name: 'a swatch carries no mark',
    edits: [
      {
        file: '../src/marks.ts',
        find: "h.DataAttribute('mark', mark), ",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an edge leaves the grid’s plain dot under it',
    edits: [{ file: '../src/marks.ts', find: "backgroundImage: 'none',", replace: '' }],
    tests: ['packages/mixins-data-grid/test/marks.browser.test.ts'],
  },
  {
    name: 'the peer colour is fixed',
    edits: [
      {
        file: '../src/marks.ts',
        find: '`var(--fk-grid-peer, ${ref.secondary.default})`',
        replace: 'ref.secondary.default',
      },
    ],
    tests,
  },
]
