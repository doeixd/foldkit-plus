/**
 * A path from the viewer predicted from the store, broken in turn:
 * `pnpm mutate packages/remote/test/viewerPath.mutations.ts`.
 */
const tests = ['packages/remote/test/viewerPath.test.ts']
const file = '../src/mutation.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a row the store lacks reads as null',
    'if (entry === undefined)\n      return Effect.succeed(Held.unheld(`${row.entity} ${row.id} is not held`))',
    'if (entry === undefined) return Effect.succeed(Held.of(null))',
  ),
  edit('a field the store lacks reads as held', 'entry.present.has(key)', 'true'),
  edit(
    'the prediction reads no store',
    '...optimisticOfWrite(write, input, keys, by, context.store),',
    '...optimisticOfWrite(write, input, keys, by),',
  ),
]
