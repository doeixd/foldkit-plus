/**
 * Choosing argument tuples (#318), broken in turn:
 * `pnpm mutate packages/entity/test/tuples.mutations.ts`.
 */
const tests = ['packages/entity/test/tuples.test.ts']
const file = '../src/conformance/tuples.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'every tuple is built before any is chosen',
    '  const next = random(seed)\n',
    '  const every = Array.from({ length: size }, (_, index) => at(index))\n  const next = random(seed + every.length * 0)\n',
  ),
  edit('a moved index is forgotten', 'moved.set(j, moved.get(i) ?? i)', 'moved.set(j, i)'),
  edit(
    'the first list varies fastest',
    'for (let i = lists.length - 1; i >= 0; i--)',
    'for (let i = 0; i < lists.length; i++)',
  ),
]
