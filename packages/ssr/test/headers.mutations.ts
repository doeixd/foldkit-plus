/**
 * `SSR.entry`'s `headers` from the Model (#389), broken in turn: `pnpm mutate
 * packages/ssr/test/headers.mutations.ts` checks that a test fails for each.
 */
const index = '../src/index.ts'
const tests = ['packages/ssr/test/entry.test.ts', 'packages/ssr/test/fallback.test.ts']

export default [
  {
    name: 'a rendered page’s headers are given no Model',
    edits: [
      {
        file: index,
        find: 'headersOf(request, Option.some(served.model))',
        replace: 'headersOf(request, Option.none())',
      },
    ],
    tests,
  },
  {
    name: 'headers may set what the entry writes',
    edits: [
      { file: index, find: '      if (ENTRY_HEADERS.has(name)) {', replace: '      if (false) {' },
    ],
    tests,
  },
  {
    name: 'headers may set location',
    edits: [{ file: index, find: "  'location',\n", replace: '' }],
    tests,
  },
  {
    name: 'headers may set content-length',
    edits: [{ file: index, find: "  'content-length',\n", replace: '' }],
    tests,
  },
  {
    name: 'a 500 whose headers fail too is reported twice',
    edits: [{ file: index, find: '        if (!reported) {', replace: '        if (true) {' }],
    tests,
  },
]
