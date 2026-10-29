/**
 * Polled fields compared by what they hold, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/pollValues.mutations.ts`
 */
const file = '../src/poll.ts'
const tests = ['packages/remote-drizzle/test/pollValues.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    "a listed row's field compares by identity",
    'field => !already.has(field) && !Equal.equals(before?.[field], values[field]),',
    'field => !already.has(field) && before?.[field] !== values[field],',
  ),
  edit(
    "a subscribed row's field compares by identity",
    'heldOf(values, own).filter(\n                field => !Equal.equals(before?.[field], values[field]),',
    'heldOf(values, own).filter(\n                field => before?.[field] !== values[field],',
  ),
]
