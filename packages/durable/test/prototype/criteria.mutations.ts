/**
 * Each §14.1 criterion broken in the journal and in the prototype:
 * `pnpm mutate packages/durable/test/prototype/criteria.mutations.ts`.
 */
const tests = ['packages/durable/test/prototype/criteria.test.ts']

export default [
  {
    name: 'journal: a retry with reordered keys hashes differently',
    edits: [
      {
        file: '../../src/journal.ts',
        find: 'for (const key of Object.keys(input).sort()) {',
        replace: 'for (const key of Object.keys(input)) {',
      },
    ],
    tests,
  },
  {
    name: 'journal: a reuse by another actor is not a conflict',
    edits: [
      {
        file: '../../src/journal.ts',
        find: 'if (!same || priorActor !== actorId) return yield* Effect.fail(conflict())',
        replace: 'if (!same) return yield* Effect.fail(conflict())',
      },
    ],
    tests,
  },
  {
    name: 'journal: an append commits outside a transaction',
    edits: [
      {
        file: '../../src/journal.ts',
        find: '      : sql.withTransaction(unit)\n  }',
        replace: '      : unit\n  }',
      },
    ],
    tests,
  },
  {
    name: 'journal: each commit skips a sequence',
    edits: [
      {
        file: '../../src/journal.ts',
        find: 'const sequence = toSequence(cursor + 1)',
        replace: 'const sequence = toSequence(cursor + 2)',
      },
    ],
    tests,
  },
  {
    name: 'journal: a read below the compaction floor is served',
    edits: [{ file: '../../src/journal.ts', find: 'if (after < floor)', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'journal: a recorded success is recorded as pending',
    edits: [
      {
        file: '../../src/journal.ts',
        find: "Effect.tap(value => record(key, 'succeeded', value, undefined)),",
        replace: "Effect.tap(value => record(key, 'pending', value, undefined)),",
      },
    ],
    tests,
  },
  {
    name: 'prototype: a retry with reordered keys hashes differently',
    edits: [
      {
        file: './eventLogJournal.ts',
        find: 'for (const key of Object.keys(input).sort())',
        replace: 'for (const key of Object.keys(input))',
      },
    ],
    tests,
  },
  {
    name: 'prototype: the opId lookup finds nothing',
    edits: [
      {
        file: './eventLogJournal.ts',
        find: 'Option.fromNullishOr(found.find(remote => remote.entry.idString === probe.idString)),',
        replace: 'Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'prototype: a reuse by another actor is not a conflict',
    edits: [
      {
        file: './eventLogJournal.ts',
        find: 'if (stored.actor !== actor || stored.hash !== envelope.hash)',
        replace: 'if (stored.hash !== envelope.hash)',
      },
    ],
    tests,
  },
  {
    name: 'prototype: the entry and the snapshot commit apart',
    edits: [
      {
        file: './eventLogJournal.ts',
        find: '        return yield* sql\n          .withTransaction(',
        replace: '        return yield* Effect.succeed(sql)\n          .pipe(() =>',
      },
    ],
    tests,
  },
  {
    name: 'prototype: the snapshot is not stored',
    edits: [
      {
        file: './eventLogJournal.ts',
        find: 'DO UPDATE SET cursor = excluded.cursor, snapshot = excluded.snapshot`',
        replace: 'DO UPDATE SET cursor = excluded.cursor`',
      },
    ],
    tests,
  },
  {
    name: 'prototype: a cursor below the compaction floor is served',
    edits: [
      { file: './eventLogJournal.ts', find: 'if (after < state.floor)', replace: 'if (false)' },
    ],
    tests,
  },
  {
    name: 'prototype: compaction keeps the payloads',
    edits: [
      {
        file: './eventLogJournal.ts',
        find: 'toBytes({ actor, hash, input: null })',
        replace: 'row.payload',
      },
    ],
    tests,
  },
  {
    name: 'prototype: the change stream skips its first commit',
    edits: [
      {
        file: './eventLogJournal.ts',
        find: '              .pipe(Stream.map(committedOf)),',
        replace: '              .pipe(Stream.drop(1), Stream.map(committedOf)),',
      },
    ],
    tests,
  },
]
