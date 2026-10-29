/**
 * A path from the viewer in a query body, compiled to SQL, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/viewerPathBody.mutations.ts`.
 * The relational conformance cases run it on SQLite and on PGlite.
 */
const tests = ['packages/remote-drizzle/test/conformance.test.ts']
const file = '../src/compile.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    "the viewer's row is read whoever may see it",
    '    onSome: rule => sql`${at} and (${rule})`,\n  })\n  const read = atRow(',
    '    onSome: () => at,\n  })\n  const read = atRow(',
  ),
  edit(
    'the path starts at the judged row',
    '    at = reachedTable(target, reached.viewer.entity, query)\n    meet(at, reached.viewer.entity)\n',
    '',
  ),
  edit(
    "a path from the viewer may not meet the judged row's table",
    "const met = reached._tag === 'ViewerPath' ? [] : [target.table]",
    'const met = [target.table]',
  ),
  edit(
    "the viewer's table's visibility is not resolved",
    "      ...(reached._tag === 'ViewerPath' ? [reached.viewer.entity] : []),\n",
    '',
  ),
  edit(
    'the path follows none of its relations from the viewer',
    '    onward(target, start),\n    node.via,\n',
    '    onward(target, start),\n    [],\n',
  ),
]
