/**
 * A stamp's column shared with another member, each check broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/stampColumn.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/stampColumn.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'bind lets one of two members on a column be stamped',
    '../src/bind.ts',
    'of stampSharers(stamps, columns, relations))',
    'of stampSharers({}, columns, relations))',
  ),
  edit(
    'the writer lets a write set a stamp’s column',
    '../src/index.ts',
    '      ...stampOverwrites(write, binding),\n',
    '',
  ),
  edit(
    'a stamped member shares with itself',
    '../src/columns.ts',
    '.filter(([member, other]) => other === column && !Object.hasOwn(stamps, member))',
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
