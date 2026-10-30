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
        find: '      ...Option.match(status, { onNone: () => ({}), onSome: status => ({ status }) }),\n',
        replace: '',
      },
    ],
    tests: entry,
  },
  {
    name: 'status is given the browser’s Model',
    edits: [
      { file: index, find: '      model: started.model,\n', replace: '      model: browser,\n' },
    ],
    tests: entry,
  },
  {
    name: 'a status no response can have is served',
    edits: [
      {
        file: index,
        find: '        if (!Number.isInteger(status) || status < 200 || status > 599) {',
        replace: '        if (false) {',
      },
    ],
    tests: entry,
  },
  {
    name: 'a fractional status is served',
    edits: [
      {
        file: index,
        find: '        if (!Number.isInteger(status) || status < 200 || status > 599) {',
        replace: '        if (status < 200 || status > 599) {',
      },
    ],
    tests: entry,
  },
  {
    name: 'a page without a status says 200',
    edits: [
      {
        file: index,
        find: '        if (statusOf === undefined) return { page: served.page, status: Option.none<number>() }',
        replace:
          '        if (statusOf === undefined) return { page: served.page, status: Option.some(200) }',
      },
    ],
    tests: entry,
  },
]
