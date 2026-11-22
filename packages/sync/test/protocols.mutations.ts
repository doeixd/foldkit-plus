/**
 * Each protection a seeded walk of `protocols.obligations.ts` guards, removed
 * in turn: `pnpm mutate packages/sync/test/protocols.mutations.ts`. The walk
 * must report `Broken` with a seed, so `protocols.test.ts` goes red.
 */
const tests = ['packages/sync/test/protocols.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  // Reconnect
  edit(
    'an operation the server committed stays pending, and is shown twice',
    '../src/sync.ts',
    '                    !ids.has(operation.opId) &&\n',
    '',
  ),
  edit(
    'the cursor does not move past a committed operation',
    '../src/sync.ts',
    '              cursor = operation.serverSequence\n              applied += 1\n',
    '              applied += 1\n',
  ),
  edit(
    'a server that started another history is not rebuilt from',
    '../src/sync.ts',
    '            const restarted =\n              response.epoch !== undefined &&',
    '            const restarted =\n              false &&\n              response.epoch !== undefined &&',
  ),
  // Two tabs settling
  edit(
    'the projection leaves out what the server committed',
    '../src/sync.ts',
    '      state.committed,\n    )\n\n  const openReplica',
    '      definition.empty,\n    )\n\n  const openReplica',
  ),
  edit(
    'the projection replays the outbox backwards',
    '../src/sync.ts',
    "    state.pending.reduce(\n      (model, operation) => definition.replay(model, messageOf(operation, 'history')),",
    "    [...state.pending].reverse().reduce(\n      (model, operation) => definition.replay(model, messageOf(operation, 'history')),",
  ),
  // The store's compare-and-swap
  edit(
    'a write lands over a revision it did not expect',
    '../src/indexedDb.ts',
    'if (revision !== expectedRevision) {',
    'if (false) {',
  ),
  edit(
    'an appended operation leaves the store at its old revision',
    '../src/indexedDb.ts',
    "            outbox.put(entry, entry.localSequence)\n            replica.put(entry.revision, 'revision')\n",
    '            outbox.put(entry, entry.localSequence)\n',
  ),
  edit(
    'a settle leaves the operations appended before it',
    '../src/indexedDb.ts',
    "            replica.put((state as { revision: number }).revision, 'revision')\n            outbox.clear()\n",
    "            replica.put((state as { revision: number }).revision, 'revision')\n",
  ),
]
