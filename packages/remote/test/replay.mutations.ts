/**
 * The rule `replay.ts` keeps, broken in turn: the way of writing, read from
 * metakit's `writeProperties`, decides how a pending write meets a newer
 * value. `pnpm mutate packages/remote/test/replay.mutations.ts`.
 */
const replay = '../src/replay.ts'
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
    "set: { commutes: { set: 'same-literal' } },",
    "set: { commutes: { set: 'always' } },",
  ),
  edit(
    'an add is declared to commute with nothing, so its answer is read again',
    ways,
    '  add: adds,\n',
    '  add: { ...adds, commutes: {} },\n',
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
    'Option.some(newer + amount)',
    'Option.some(newer)',
  ),
  edit(
    'an answer that is the replay is read again',
    replay,
    'Option.exists(replayed(layer, key, field, newer), value =>',
    'Option.exists(Option.none(), value =>',
  ),
]
