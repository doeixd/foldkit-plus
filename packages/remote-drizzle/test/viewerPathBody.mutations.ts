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
  {
    name: "the viewer's row is read whoever may see it",
    edits: [
      {
        file: '../src/target.ts',
        find: "const where = visibleRows(target, owner, eq(columnFor(start, 'id', query), id), query)",
        replace: "const where = eq(columnFor(start, 'id', query), id)",
      },
    ],
    tests,
  },
  edit(
    'the path starts at the judged row',
    '    at = reachedTable(target, reached.viewer.identity, query)\n    meet(at, reached.viewer.identity)\n',
    '',
  ),
  edit(
    "a path from the viewer may not meet the judged row's table",
    '    ViewerPath: () => [],\n',
    '    ViewerPath: () => [target.table],\n',
  ),
  edit(
    "the viewer's table's visibility is not resolved",
    'ViewerPath: ({ viewer }) => [viewer.identity, ...through],',
    'ViewerPath: () => through,',
  ),
  {
    name: 'the path follows none of its relations from the viewer',
    edits: [
      {
        file: '../src/render.ts',
        find: 'hopsFrom(entity, path.slice(0, -1), query),',
        replace: '[],',
      },
    ],
    tests,
  },
]
