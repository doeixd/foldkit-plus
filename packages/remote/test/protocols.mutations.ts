/**
 * Each protection a seeded walk of `protocols.obligations.ts` guards, removed
 * in turn: `pnpm mutate packages/remote/test/protocols.mutations.ts`. The walk
 * must report `Broken` with a seed, so `protocols.test.ts` goes red.
 */
const tests = ['packages/remote/test/protocols.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  // Latest wins
  edit(
    'a request keeps no order, so an earlier answer is as new as a later one',
    '../src/ledger.ts',
    '  order: new Map([...state.order, [requestId, state.sequence + 1]]),\n',
    '',
  ),
  edit(
    'an earlier answer overwrites a field a later one settled',
    '../src/ledger.ts',
    '.filter(([field]) => !newer(`${key}\\u0000${field}`)),',
    '.filter(() => true),',
  ),
  edit(
    'an earlier edit still shows a field a later answer settled',
    '../src/optimistic.ts',
    'if (settled === undefined) return [patch]',
    'return [patch]',
  ),
  // Optimistic rollback
  edit(
    'a failure leaves the layer of the write that failed',
    '../src/optimistic.ts',
    'const layers = optimistic.layers.filter(layer => layer.id !== id)',
    'const layers = optimistic.layers',
  ),
  edit(
    'a failure removes every layer, the other pending writes with it',
    '../src/optimistic.ts',
    'const layers = optimistic.layers.filter(layer => layer.id !== id)',
    'const layers = optimistic.layers.filter(() => false)',
  ),
  // Stale responses and the stream's reconnect
  edit(
    'a response older than the row held replaces it',
    '../src/store.ts',
    '    if (olderThanHeld(held, write.revision)) continue\n',
    '',
  ),
  edit(
    'an event ahead of its cursor is applied, and the missed ones never come back',
    '../src/liveEvents.ts',
    "cursor <= state.cursor ? 'duplicate' : cursor === state.cursor + 1 ? 'applied' : 'gap'",
    "cursor <= state.cursor ? 'duplicate' : 'applied'",
  ),
  // The late answer
  edit(
    'an answer is never read again against a newer patch',
    '../src/model.ts',
    'return askedAgain(capabilities, next, again)',
    'return next',
  ),
  edit(
    'a read answered beside a pending write keeps nothing',
    '../src/model.ts',
    'kept: capabilities.keeps(model, message.result.entities, held, message.now),',
    'kept: model.kept,',
  ),
  edit(
    'a stale live patch is written over the answer',
    '../src/liveEvents.ts',
    'const contradicted = named.filter(field => !Equal.equals(values[field], echo.values[field]))',
    'const contradicted: Array<string> = []',
  ),
]
