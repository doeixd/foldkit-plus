/**
 * The revisions a live stream names, broken in turn:
 * `pnpm mutate packages/remote/test/liveRevisions.mutations.ts`.
 */
const entry = '../src/liveEntry.ts'
const reads = '../src/liveReads.ts'
const store = '../src/store.ts'
const tests = ['packages/remote/test/liveRevisions.test.ts']

export default [
  {
    name: 'a row held to a write is named at its revision',
    edits: [{ file: reads, find: '        held.floor !== undefined ||\n', replace: '' }],
    tests,
  },
  {
    name: 'a stale field does not keep a row out',
    edits: [
      {
        file: reads,
        find: ' &&\n            !held.stale.has(field) &&',
        replace: ' &&',
      },
    ],
    tests,
  },
  {
    name: 'a missing field does not keep a row out',
    edits: [
      {
        file: reads,
        find: '            held.present.has(field) &&\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a field an older revision wrote counts as held at the newer',
    edits: [
      {
        file: reads,
        find: ' &&\n            held.revisionFields?.has(field) === true',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a write at the held revision forgets the fields written at it before',
    edits: [
      {
        file: store,
        find: 'revision === undefined || revision === previous.revision ? previous.revisionFields : []',
        replace: 'revision === undefined ? previous.revisionFields : []',
      },
    ],
    tests,
  },
  {
    name: 'a write with no revision leaves its fields known at the revision',
    edits: [
      {
        file: store,
        find: '    if (revision === undefined) fields.delete(field)\n    else fields.add(field)',
        replace: '    if (revision !== undefined) fields.add(field)',
      },
    ],
    tests,
  },
  {
    name: 'a capture drops the fields known at the revision',
    edits: [
      {
        file: '../src/resume.ts',
        find: 'field => store[key]?.revisionFields?.has(field) === true',
        replace: '() => false',
      },
    ],
    tests: ['examples/writes-domain/test/ssr.test.ts'],
  },
  {
    name: 'a stream names more revisions than the wire takes',
    edits: [{ file: reads, find: '    .slice(0, MAX_READ_AFTER)\n', replace: '' }],
    tests,
  },
  {
    name: 'a tombstone is named at its revision',
    edits: [{ file: reads, find: '        held.tombstone ||\n', replace: '' }],
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
        file: reads,
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
