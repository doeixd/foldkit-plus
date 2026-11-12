/**
 * Named cursors and parked runs, broken one guard at a time:
 * `pnpm mutate packages/durable/test/cursors.mutations.ts`.
 */
const journal = '../src/journal.ts'
const tests = ['packages/durable/test/journal.test.ts']

export default [
  {
    name: 'a cursor of another epoch reads as it was',
    edits: [
      { file: journal, find: '      if (String(row.epoch) !== now)', replace: '      if (false)' },
    ],
    tests,
  },
  {
    name: 'an advance may move a cursor back',
    edits: [
      {
        file: journal,
        find: 'cursor = CASE WHEN epoch = ${at} THEN MAX(cursor, ${to}) ELSE ${to} END,',
        replace: 'cursor = ${to},',
      },
    ],
    tests,
  },
  {
    name: 'an advance that moves nothing clears the failures',
    edits: [
      {
        file: journal,
        find: 'attempts = CASE WHEN epoch = ${at} AND cursor >= ${to} THEN attempts ELSE 0 END,',
        replace: 'attempts = 0,',
      },
    ],
    tests,
  },
  {
    name: 'a write naming a reset epoch lands',
    edits: [
      {
        file: journal,
        find: "        WHERE key = ${key} AND name = ${name} AND ${at} = (SELECT epoch FROM epochs WHERE key = ${key})`.pipe(\n        Effect.catchTag('SqlError', asJournalError('Could not advance the cursor')),",
        replace:
          "        WHERE key = ${key} AND name = ${name}`.pipe(\n        Effect.catchTag('SqlError', asJournalError('Could not advance the cursor')),",
      },
    ],
    tests,
  },
  {
    name: 'a failure naming a reset epoch lands',
    edits: [
      {
        file: journal,
        find: "        WHERE key = ${key} AND name = ${name} AND ${at} = (SELECT epoch FROM epochs WHERE key = ${key})`.pipe(\n        Effect.catchTag('SqlError', asJournalError('Could not record the failed run')),",
        replace:
          "        WHERE key = ${key} AND name = ${name}`.pipe(\n        Effect.catchTag('SqlError', asJournalError('Could not record the failed run')),",
      },
    ],
    tests,
  },
  {
    name: 'a failure counted again keeps its first time',
    edits: [
      {
        file: journal,
        find: 'first_failed_at = CASE WHEN epoch = ${at} AND first_failed_at IS NOT NULL THEN first_failed_at ELSE ${when} END,',
        replace: 'first_failed_at = ${when},',
      },
    ],
    tests,
  },
  {
    name: 'tracking again resets a cursor of this epoch',
    edits: [
      {
        file: journal,
        find: 'WHERE foldkit_durable_cursors.epoch <> excluded.epoch',
        replace: 'WHERE 1 = 1',
      },
    ],
    tests,
  },
  {
    name: 'a run parked in a later history keeps the stale row',
    edits: [
      {
        file: journal,
        find: 'ON CONFLICT(key, name, op_id) DO UPDATE SET epoch = excluded.epoch, sequence = excluded.sequence, input = excluded.input, error = excluded.error WHERE foldkit_durable_parked.epoch <> excluded.epoch',
        replace: 'ON CONFLICT(key, name, op_id) DO NOTHING',
      },
    ],
    tests,
  },
  {
    name: 'tracking from the floor starts at the cursor',
    edits: [
      {
        file: journal,
        find: "trackOptions?.from === 'floor' ? Number(yield* floor(key)) : Number(yield* cursor(key))",
        replace: 'Number(yield* cursor(key))',
      },
    ],
    tests,
  },
]
