/**
 * A held list over what its body reaches in other rows, each step broken in
 * turn: `pnpm mutate packages/remote/test/reachImpact.mutations.ts`.
 */
const tests = ['packages/remote/test/reachImpact.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/impact.ts', find, replace }],
  tests,
})

export default [
  edit(
    'a change to a row another reads is never looked at',
    'const read = reached?.others.get(change.entity)',
    'const read: ReadonlySet<string> | undefined = undefined',
  ),
  edit('a reached row deleted keeps the list', 'Deleted: () => true,', 'Deleted: () => false,'),
  edit(
    'any change to a reached Entity fetches the list again',
    'Changed: ({ fields }) => fields.some(field => read.has(field)),',
    'Changed: () => true,',
  ),
  edit(
    'a change to the link a path starts from is not judged',
    'fields.some(field => reached?.own.has(field) === true)',
    'false',
  ),
  edit(
    'a path does not read the field it reaches',
    'fromRow(path.via)\n          other(path.field.owner.name, path.field.key)',
    'fromRow(path.via)',
  ),
  edit(
    'an exists does not read the relation pointing here',
    'other(exists.relation.owner.name, exists.relation.key)',
    'void exists',
  ),
  edit(
    'an exists does not read what its filter reads',
    'dependenciesOf(where).fields.forEach(field => other(field.entity, field.key)),',
    '[],',
  ),
  edit(
    'a path from the viewer reads none of its links',
    'for (const relation of path.via) other(relation.owner.name, relation.key)',
    'void path.via',
  ),
]
