/**
 * The scenario harness and the adapter it exercises, broken in turn:
 * `pnpm mutate examples/writes-domain/test/scenario/scenario.mutations.ts`.
 */
const adapter = '../../../../packages/remote-domain/src/adapter/layer.ts'
const sqlite = '../../src/scenario/sqlite.ts'
const ordering = ['examples/writes-domain/test/scenario/ordering.test.ts']
const report = ['examples/writes-domain/test/scenario/scenario.test.ts']

export default [
  {
    // A retry of a lost reply then decides the write again: Domain finds the revision moved.
    name: 'the command id is random for each attempt',
    edits: [
      {
        file: adapter,
        find: 'digest: yield* digest(JSON.stringify([asking, target, request.keys ?? null, encoded])),',
        replace: 'digest: yield* digest(String(Math.random())),',
      },
    ],
    tests: ordering,
  },
  {
    name: 'a View frame older than one already let through is let through',
    edits: [
      {
        file: adapter,
        find: 'tombstone ? order <= held.value.revision : order < held.value.revision',
        replace: 'false',
      },
    ],
    tests: ordering,
  },
  {
    name: 'the SQLite runner expects a ledger row for a write that did not land',
    edits: [
      {
        file: sqlite,
        find: 'expected: lands(scenario)',
        replace: 'expected: !lands(scenario)',
      },
    ],
    tests: report,
  },
]
