/**
 * A collection relation read whole, its bound broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/collectionBound.mutations.ts`
 */
const file = '../src/index.ts'
const tests = [
  'packages/remote-drizzle/test/collectionBound.test.ts',
  'packages/remote-drizzle/test/collectionWork.test.ts',
]
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a whole list is not held to the bound',
    'if (refs.length > maxCollection) {',
    'if (false) {',
  ),
  edit(
    'a parent at the bound is refused',
    'if (refs.length > maxCollection) {',
    'if (refs.length >= maxCollection) {',
  ),
  edit(
    'the statement selects every child',
    'single ? 1 : maxCollection + 1,',
    'single ? 1 : Number.MAX_SAFE_INTEGER,',
  ),
  edit(
    'an inverse one-to-one reads its children whole',
    'single ? 1 : maxCollection + 1,',
    'maxCollection + 1,',
  ),
  edit(
    'the default bound is another',
    'const maxCollection = options?.maxCollection ?? 100',
    'const maxCollection = options?.maxCollection ?? 1000',
  ),
  // What #283 found: the rows were bounded, the work was not.
  edit(
    "each parent's children are asked without a limit",
    'order by ${sql.join([...order], sql`, `)} limit ${keep}`',
    'order by ${sql.join([...order], sql`, `)} limit ${Number.MAX_SAFE_INTEGER}`',
  ),
  edit(
    "a through table's children are ordered by the target's id",
    'term.key === targetId ? { ...term, key: side.held } : term',
    'term',
  ),
  edit(
    'any bound is taken',
    'if (!Number.isInteger(maxCollection) || maxCollection < 1) {',
    'if (false) {',
  ),
]
