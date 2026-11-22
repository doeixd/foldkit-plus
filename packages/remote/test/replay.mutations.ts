/**
 * The rule `replay.ts` keeps, broken in turn: the way of writing, read from
 * metakit's `writeProperties`, decides how a pending write meets a newer
 * value. `pnpm mutate packages/remote/test/replay.mutations.ts`.
 */
const replay = '../src/replay.ts'
const optimistic = '../src/optimistic.ts'
const ways = '../../metakit/src/ops/ways.ts'
const tests = ['packages/remote/test/replay.test.ts', 'packages/remote/test/temporal.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a set is declared to commute with any set, so its answer is never read again',
    ways,
    "setWrites: WriteProperties = { commutes: { set: 'same-literal' } }",
    "setWrites: WriteProperties = { commutes: { set: 'always' } }",
  ),
  edit(
    'an add is declared to commute with nothing, so its answer is read again',
    ways,
    "? { add: 'in-range' } : {},",
    '? {} : {},',
  ),
  edit(
    'a way replays on a condition over the two values',
    replay,
    "condition !== undefined && condition !== 'same-literal' && condition !== 'different-literals'",
    'condition !== undefined',
  ),
  edit(
    'the replay leaves the newer value as it was',
    replay,
    'Option.some(newer + delta)',
    'Option.some(newer)',
  ),
  edit(
    'an answer equal to the replay settles whatever the revisions say',
    replay,
    'rightAfter(store[key], revision, field) &&',
    '',
  ),
  edit(
    'an answer at any later revision is taken for the next',
    replay,
    'revision === held.revision + 1',
    'revision !== undefined && revision > held.revision',
  ),
  edit('a revision steps by less than one', replay, 'Number.isSafeInteger(held.revision) &&', ''),
  edit(
    'the row revision vouches for a field it did not carry',
    replay,
    'held.revisionFields?.has(field) === true',
    'true',
  ),
  edit(
    'a read is taken to leave out every pending write, and the add is shown over it',
    replay,
    "included: from === 'read' ? new Set([...(was?.included ?? []), ...ids]) : was?.included,",
    'included: was?.included,',
  ),
  edit(
    'a layer adds its amount over a read that may include it',
    optimistic,
    'increments: unincluded(adds, kept.get(key), layer.id),',
    'increments: adds ?? {},',
  ),
  edit(
    'an answer forgets which pending writes the read may include',
    replay,
    'if (by.size > 0) rest.set(field, { since: entry.since, by, included })',
    'if (by.size > 0) rest.set(field, { since: entry.since, by })',
  ),
  edit(
    'an answer that is the replay is read again',
    replay,
    'Option.exists(replayed(layer, key, field, newer), value =>',
    'Option.exists(Option.none(), value =>',
  ),
]
