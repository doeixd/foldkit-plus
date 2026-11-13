/**
 * `Closure.reads` and `Closure.violations`: `pnpm mutate packages/surface/test/closure.mutations.ts`.
 */
const tests = [
  'packages/surface/test/closure.test.ts',
  'packages/surface/test/closureViolations.test.ts',
]

const edit = (name: string, find: string, replace: string, file = '../src/closure.ts') => ({
  name,
  edits: [{ file, find, replace }],
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
  edit(
    'a Message outside the set is not compared',
    '      const { codec, read } = partsOf(projection)\n      const [was, now] = [read(before), read(after)]\n      return Object.is(was, now) || equivalence(codec)(was, now)\n',
    '      return []\n      const { codec, read } = partsOf(projection)\n      const [was, now] = [read(before), read(after)]\n      return Object.is(was, now) || equivalence(codec)(was, now)\n',
  ),
  edit(
    'a Message in the set is not checked for reads',
    'const fields = reads(app, projection, before, message)',
    'const fields: ReadonlyArray<string> = []',
  ),
  edit('closed is ignored: every Surface is tested', '.filter(surface => surface.closed)', ''),
  edit(
    'closed is ignored: the flag is always false',
    'closed: config.closed ?? false,',
    'closed: false,',
    '../src/index.ts',
  ),
  edit(
    'the application drops the closed flag',
    '      closed: surfaceConfig.closed,\n',
    '',
    '../src/index.ts',
  ),
  edit(
    'the contract omits the closed flag',
    '...(surface.closed ? { closed: true as const } : {})',
    '...{}',
    '../src/index.ts',
  ),
]
