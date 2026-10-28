/**
 * `bind` and `source` compiling a `Derived.exists`, each step broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/derivedExists.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/derivedExists.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'an exists entry is accepted',
    '../src/bind.ts',
    'if (Object.hasOwn(counts, field))\n            fail(\n              `derived "${field}" on entity "${name}" is a Derived.exists',
    'if (false)\n            fail(\n              `derived "${field}" on entity "${name}" is a Derived.exists',
  ),
  edit(
    'the viewer column is the read relation',
    '../src/bind.ts',
    'column: storedOn(pointingKeyOf(viewer, name, field), viewer, name, field),',
    'column: storedOn(pointingKeyOf(viewer, name, field), relation, name, field),',
  ),
  edit(
    'a source without a viewer is accepted',
    '../src/index.ts',
    'if (perViewer.length > 0 && options?.viewer === undefined) {',
    'if (false) {',
  ),
  edit(
    'a shared exists is accepted',
    '../src/index.ts',
    'if (sharedPerViewer.length > 0) {',
    'if (false) {',
  ),
  edit(
    'a reader of another Entity is read as a User',
    '../src/index.ts',
    'ref => ref.entity === viewing.entity,',
    '() => true,',
  ),
  edit(
    'every reader reads the same',
    '../src/index.ts',
    'eq(viewing.column, reader.value.id),',
    '',
  ),
  edit(
    'hidden rows are found',
    '../src/index.ts',
    'eq(viewing.column, reader.value.id),\n                    countPolicy,',
    'eq(viewing.column, reader.value.id),',
  ),
  edit(
    'the greatest id is read',
    '../src/index.ts',
    'sql<string>`min(${side.child})`',
    'sql<string>`max(${side.child})`',
  ),
  edit(
    'the exists is read as a count',
    '../src/index.ts',
    'if (viewing !== undefined) {',
    'if (false) {',
  ),
]
