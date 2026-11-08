/**
 * A not-null column's order term places no nulls, and a nullable one's does,
 * each broken in turn: `pnpm mutate packages/remote-drizzle/test/orderPlan.mutations.ts`.
 */
const tests = [
  'packages/remote-drizzle/test/plans.test.ts',
  'packages/remote-drizzle/test/compile.test.ts',
]
const cursor = '../src/cursor.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: cursor, find, replace }],
  tests,
})

export default [
  edit('every term places its nulls', 'is(term.key, Column) && term.key.notNull', 'false'),
  edit('no term places its nulls', 'is(term.key, Column) && term.key.notNull', 'true'),
]
