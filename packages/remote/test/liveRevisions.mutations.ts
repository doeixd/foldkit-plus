/**
 * The revisions a live stream names, broken in turn:
 * `pnpm mutate packages/remote/test/liveRevisions.mutations.ts`.
 */
const entry = '../src/liveEntry.ts'
const tests = ['packages/remote/test/liveRevisions.test.ts']

export default [
  {
    name: 'a row held to a write is named at its revision',
    edits: [{ file: entry, find: '      held.floor !== undefined ||\n', replace: '' }],
    tests,
  },
  {
    name: 'a stale field does not keep a row out',
    edits: [
      {
        file: entry,
        find: 'held.present.has(field) && !held.stale.has(field)',
        replace: 'held.present.has(field)',
      },
    ],
    tests,
  },
  {
    name: 'a missing field does not keep a row out',
    edits: [
      {
        file: entry,
        find: 'held.present.has(field) && !held.stale.has(field)',
        replace: '!held.stale.has(field)',
      },
    ],
    tests,
  },
  {
    name: 'a tombstone is named at its revision',
    edits: [{ file: entry, find: '      held.tombstone ||\n', replace: '' }],
    tests,
  },
  {
    name: 'a moved revision restarts the stream',
    edits: [
      {
        file: entry,
        find: '    revisions: startRevisions,',
        replace: '    revisions: Schema.Array(RowRevision),',
      },
    ],
    tests,
  },
  {
    name: 'the stream is opened without the revisions',
    edits: [
      {
        file: '../src/liveReads.ts',
        find: '        ...(revisions.length === 0 ? {} : { revisions }),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an RPC client drops the revisions',
    edits: [
      {
        file: '../src/remote.ts',
        find: '                ...(revisions === undefined || revisions.length === 0 ? {} : { revisions }),\n',
        replace: '',
      },
    ],
    tests,
  },
]
