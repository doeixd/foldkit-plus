/**
 * The generation a read entry is planned under (`refreshedAt`), broken in
 * turn: `pnpm mutate packages/remote/test/refreshedAt.mutations.ts`. Its
 * point is that `Data.refresh` restarts the entries observing what was
 * refreshed and no others, and that `forget` restarts them all.
 */
const tests = [
  'packages/remote/test/domain.test.ts',
  'packages/remote/test/refreshActive.test.ts',
  'packages/remote/test/forget.test.ts',
]
const model = '../src/model.ts'
const fields =
  'for (const mark of fieldMarks(requests)) at = Math.max(at, refresh.requested.get(mark) ?? 0)'
const connection = 'at = Math.max(at, refresh.requested.get(connectionMark(identity)) ?? 0)'
const edit = (name: string, find: string, replace: string, file = model) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a refresh restarts every read entry',
    fields,
    'for (const mark of fieldMarks(requests)) at = Math.max(at, refresh.generation)',
  ),
  edit(
    'a refresh of a field restarts nothing',
    fields,
    'for (const mark of fieldMarks(requests)) void mark',
  ),
  edit(
    'a field takes the last mark, not the highest',
    fields,
    'for (const mark of fieldMarks(requests)) at = refresh.requested.get(mark) ?? at',
  ),
  edit('a refreshed connection restarts nothing', connection, 'void identity'),
  edit(
    'a refreshed connection restarts every read entry',
    connection,
    'at = Math.max(at, refresh.generation)',
  ),
  edit('forget restarts no read entry', 'let at = refresh.floor', 'let at = 0'),
]
