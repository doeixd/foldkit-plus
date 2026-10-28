/**
 * What a Drizzle-backed server reports, each report broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/diagnostics.mutations.ts`.
 */
const index = '../src/index.ts'
const diagnostics = '../src/diagnostics.ts'
const tests = ['packages/remote-drizzle/test/diagnostics.test.ts']

export default [
  {
    name: 'a failed statement is not reported',
    edits: [
      {
        file: index,
        find: '    Effect.tapError(error => Diagnostics.report(statementFailed(failed, error))),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a failed ledgered write is not reported',
    edits: [
      {
        file: index,
        find: "Diagnostics.report(statementFailed('Database write failed', error)),",
        replace: 'Effect.void,',
      },
    ],
    tests,
  },
  {
    name: 'a failed statement is reported as a warning',
    edits: [
      {
        file: diagnostics,
        find: "  level: 'error',\n  message: `${failed}, and the caller",
        replace: "  level: 'warning',\n  message: `${failed}, and the caller",
      },
    ],
    tests,
  },
  {
    name: 'rules no CHECK holds are not reported',
    edits: [{ file: index, find: '    serverOnly.length === 0\n', replace: '    true\n' }],
    tests,
  },
  {
    name: 'rules no CHECK holds are reported on every write',
    edits: [{ file: index, find: '          if (reported) return Effect.void\n', replace: '' }],
    tests,
  },
  {
    name: 'a binding with no such rule reports anyway',
    edits: [
      {
        file: index,
        find: '    serverOnly.length === 0\n',
        replace: '    false\n',
      },
    ],
    tests,
  },
  {
    name: 'rules no CHECK holds are reported as an error',
    edits: [
      {
        file: diagnostics,
        find: "  level: 'warning',\n  message: `${entity}'s table",
        replace: "  level: 'error',\n  message: `${entity}'s table",
      },
    ],
    tests,
  },
]
