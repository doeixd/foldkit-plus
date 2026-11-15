/**
 * What a server render hands the browser, broken in turn:
 * `pnpm mutate packages/remote/test/resume.mutations.ts`.
 */
const file = '../src/resume.ts'
const tests = ['packages/remote/test/resume.test.ts']

export default [
  {
    name: "a capture leaves out a row's floor",
    edits: [{ file, find: '      floor: stored.floor,\n', replace: '      floor: undefined,\n' }],
    tests,
  },
  {
    name: "a restore drops a captured row's floor",
    edits: [
      {
        file,
        find: '          ...(entry.floor === undefined ? {} : { floor: entry.floor }),\n        } satisfies EntityEntry,',
        replace: '        } satisfies EntityEntry,',
      },
    ],
    tests,
  },
]
