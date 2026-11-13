const tests = ['packages/primitives/test/grid-navigation.test.ts']
const file = '../src/interaction/grid-navigation.ts'

export default [
  {
    name: 'paging is handled without a page',
    edits: [
      {
        file,
        find: "if (options.page !== undefined && (key === 'PageUp' || key === 'PageDown')) {",
        replace: "if (key === 'PageUp' || key === 'PageDown') {",
      },
    ],
    tests,
  },
  {
    name: 'a page moves one row whatever page says',
    edits: [
      {
        file,
        find: 'current + options.page * columns',
        replace: 'current + columns',
      },
    ],
    tests,
  },
  {
    name: 'PageDown passes the last row of the column',
    edits: [
      {
        file,
        find: 'Math.min(bottom, current + options.page * columns)',
        replace: 'current + options.page * columns',
      },
    ],
    tests,
  },
  {
    name: 'PageUp passes the first row of the column',
    edits: [
      {
        file,
        find: 'Math.max(column, current - options.page * columns)',
        replace: 'current - options.page * columns',
      },
    ],
    tests,
  },
  {
    name: 'a disabled landing cell is not skipped',
    edits: [
      {
        file,
        find: `    for (let index = landing; index >= column && index <= bottom; index += step) {
      if (isEnabled(index)) return index
    }`,
        replace: `    if (isEnabled(landing)) return landing`,
      },
    ],
    tests,
  },
  {
    name: 'a disabled edge does not fall back toward the current cell',
    edits: [
      {
        file,
        find: '      let index = landing - step;',
        replace: '      let index = current;',
      },
    ],
    tests,
  },
  {
    name: 'the behavior does not pass page to move',
    edits: [
      {
        file,
        find: '...(args.page === undefined ? {} : { page: args.page }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a page key from nothing lands on the wrong end',
    edits: [
      {
        file,
        find: 'if (current === -1) return down ? first : last',
        replace: 'if (current === -1) return down ? last : first',
      },
    ],
    tests,
  },
]
