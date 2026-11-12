/**
 * `Closure.reads`: `pnpm mutate packages/surface/test/closure.mutations.ts`.
 */
const tests = ['packages/surface/test/closure.test.ts']

const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/closure.ts', find, replace }],
  tests,
})

export default [
  edit('reads resets no field', '    for (const key of fields) reset[key] = baseline[key]\n', ''),
  edit(
    'the slices are compared by identity alone',
    'return !Object.is(after, other) && !equal(after, other)',
    'return !Object.is(after, other)',
  ),
  edit(
    'a field at its initial value is a candidate',
    ' && !Object.is(live[key], baseline[key])',
    '',
  ),
  edit('a field the projection owns is a candidate', 'key => !own.has(key) &&', 'key =>'),
  edit(
    'fields that each alone is enough go unnamed',
    'return named.length === 0 ? outside : named',
    'return named',
  ),
  edit(
    'every candidate is named without resetting one at a time',
    'outside.filter(key => differs([key]))',
    'outside',
  ),
]
