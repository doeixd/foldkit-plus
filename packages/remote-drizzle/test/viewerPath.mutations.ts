/**
 * A path from the viewer read by the server, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/viewerPath.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/viewerPath.test.ts']
const file = '../../remote-server/src/index.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a server serving no row the path reads is made',
    'const unserved = reads.filter(entity => !served.has(entity))',
    'const unserved = reads.filter(() => false)',
  ),
  {
    name: 'a row is read past its source filter',
    edits: [
      {
        file,
        find: 'readFiltered(source, principal, allowed, read =>',
        replace:
          '((_s: unknown, _p: unknown, f: ReadonlyArray<string>, read: (f: ReadonlyArray<string>) => unknown) => read(f))(source, principal, allowed, read =>',
      },
    ],
    tests,
    survives:
      "only a Source with a member filter (Guard's member Read rules) has a plan to apply, and none is mounted here; the binding's visible rule is inside source.read",
  },
  {
    ...edit(
      'a row the source does not return is read as there',
      'Option.map(Option.fromUndefinedOr(records[0]), record => record.values),',
      'Option.some(records[0]?.values ?? {}),',
    ),
    survives:
      "equivalent for a path: a row not returned and a row without the field both read as null, as SQL reads a hidden row's field; the none is for run's other callers",
  },
]
