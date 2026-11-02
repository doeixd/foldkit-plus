/**
 * `SSR.entry`'s `status` (#364), broken in turn: `pnpm mutate
 * packages/ssr/test/status.mutations.ts` checks that a test fails for each.
 */
const index = '../src/index.ts'
const entry = ['packages/ssr/test/entry.test.ts']

export default [
  {
    name: 'the status is not carried on the page',
    edits: [
      {
        file: index,
        find: '...Option.match(status, { onNone: () => ({}), onSome: status => ({ status }) }),',
        replace: '',
      },
    ],
    tests: entry,
  },
  {
    name: 'status is given the browser’s Model',
    edits: [{ file: index, find: '      model: started.model,', replace: '      model: browser,' }],
    tests: entry,
  },
  {
    name: 'a status no response can have is served',
    edits: [
      {
        file: index,
        find: 'if (Option.isSome(unanswerable)) {',
        replace: 'if (false) {',
      },
    ],
    tests: entry,
  },
  {
    name: 'a fractional status is served',
    edits: [
      {
        file: index,
        find: '!Number.isInteger(given) ||',
        replace: 'false ||',
      },
    ],
    tests: entry,
  },
  {
    name: 'a bodyless status is served',
    edits: [{ file: index, find: 'given === 204 ||', replace: 'false ||' }],
    tests: entry,
  },
  {
    name: 'a reset-content status is served',
    edits: [{ file: index, find: 'given === 205 ||', replace: 'false ||' }],
    tests: entry,
  },
  {
    name: 'a not-modified status is served',
    edits: [{ file: index, find: 'given === 304,', replace: 'false,' }],
    tests: entry,
  },
  {
    name: 'a page without a status says 200',
    edits: [
      {
        file: index,
        find: 'Option.map(Option.fromUndefinedOr(statusOf), of => of(served.model, request))',
        replace:
          'Option.orElseSome(Option.map(Option.fromUndefinedOr(statusOf), of => of(served.model, request)), () => 200)',
      },
    ],
    tests: entry,
  },
]
