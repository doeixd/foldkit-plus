/**
 * Pagination, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/pagination.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/pagination.test.ts']

export default [
  {
    name: 'every stop draws, however many',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1)',
        replace: 'if (count <= 3) return Array.from({ length: count }, (_, index) => index + 1)',
      },
    ],
    tests,
  },
  {
    name: 'the current stop reads as any other',
    edits: [
      {
        file: '../src/pagination.ts',
        find: "...(item === current ? [h.AriaCurrent('page')] : []),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a lone page paginates',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'if (Math.floor(options.pageCount) < 2) return h.empty',
        replace: 'if (Math.floor(options.pageCount) < 1) return h.empty',
      },
    ],
    tests,
  },
  {
    name: 'choosing a stop stays put',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'h.OnClick(options.onPage(item)),',
        replace: 'h.OnClick(options.onPage(current)),',
      },
    ],
    tests,
  },
]
