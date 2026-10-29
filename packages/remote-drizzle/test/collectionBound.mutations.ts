/**
 * A collection relation read whole, its bound broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/collectionBound.mutations.ts`
 */
const file = '../src/index.ts'
const tests = ['packages/remote-drizzle/test/collectionBound.test.ts']
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
  edit(
    'any bound is taken',
    'if (!Number.isInteger(maxCollection) || maxCollection < 1) {',
    'if (false) {',
  ),
]
