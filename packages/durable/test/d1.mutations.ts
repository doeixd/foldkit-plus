/**
 * The journal over D1, each D1-only guard broken in turn: `pnpm mutate
 * packages/durable/test/d1.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/durable/test/d1.test.ts']
const file = '../src/journal.ts'

export default [
  {
    name: 'the version is read from user_version on D1',
    edits: [
      {
        file,
        find: 'const current = d1 ? yield* readMetaVersion(sql) : yield* readPragmaVersion(sql)',
        replace: 'const current = yield* readPragmaVersion(sql)',
      },
    ],
    tests,
  },
  {
    name: 'every unit runs in a transaction, even on D1',
    edits: [
      {
        file,
        find: '=> (d1 ? unit : sql.withTransaction(unit))',
        replace: '=> sql.withTransaction(unit)',
      },
    ],
    tests,
  },
  {
    name: 'a conflict is not retried',
    edits: [
      {
        file,
        find: 'schedule: Schedule.recurs(MAX_COMMIT_RETRIES)',
        replace: 'schedule: Schedule.recurs(0)',
      },
    ],
    tests,
  },
  {
    name: 'reads never re-check the floor',
    edits: [
      {
        file,
        find: `        if (d1) {
          const reread = yield* sql<{`,
        replace: `        if (false) {
          const reread = yield* sql<{`,
      },
    ],
    tests,
  },
  {
    name: 'the snapshot replays past the cursor',
    edits: [{ file, find: 'AND sequence <= ${cursor}', replace: 'AND sequence <= 999999' }],
    tests,
  },
  {
    name: 'vacuum rebuilds on D1',
    edits: [
      { file, find: 'nothing to report.\n    if (d1) return', replace: 'nothing to report.' },
    ],
    tests,
  },
  {
    name: 'd1 is accepted over a file',
    edits: [{ file: '../src/node.ts', find: 'if (options.d1 === true)', replace: 'if (false)' }],
    tests,
  },
]
