/**
 * A member the context sets on a column shared with another, each check
 * broken in turn: `pnpm mutate packages/remote-drizzle/test/setsColumn.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/setsColumn.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'bind lets one of two members on a column be set',
    '../src/bind.ts',
    'of contextSharers(entity.sets, columns, relations))',
    'of contextSharers({}, columns, relations))',
  ),
  edit(
    'the writer lets a write set the column the context sets',
    '../src/index.ts',
    '      ...contextOverwrites(write, binding),\n',
    '',
  ),
  edit(
    'a member the context sets shares with itself',
    '../src/columns.ts',
    '.filter(([member, other]) => other === column && !Object.hasOwn(sets, member))',
    '.filter(([, other]) => other === column)',
  ),
  edit(
    'a relation’s foreign key is no column',
    '../src/columns.ts',
    "relation.kind === 'one' ? [[key, relation.field] as const] : [],",
    '[],',
  ),
  edit(
    'a write’s links are not what it writes',
    '../src/columns.ts',
    '    ...write.links.map(link => link.relation.key),\n',
    '',
  ),
]
