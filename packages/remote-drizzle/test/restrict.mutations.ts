/**
 * A delete restricted in the domain (#467), each piece broken:
 * `pnpm mutate packages/remote-drizzle/test/restrict.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/restrict.test.ts']
const index = '../src/index.ts'
const bind = '../src/bind.ts'
const server = '../../remote-server/src/index.ts'
const entity = '../../entity/src/entity.ts'
const descriptor = '../../remote/src/mutationDescriptor.ts'
const clientTests = ['packages/remote/test/precondition.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the delete statement ignores pointers',
    index,
    '...restricted.map(({ exists }) => sql`not ${exists}`)',
    '...[]',
  ),
  edit(
    'a pointed-at miss reads as moved',
    index,
    '{ where: and(eq(idColumn(binding), id), exists) },\n          )\n          if (found.length > 0)',
    '{ where: and(eq(idColumn(binding), id), exists) },\n          )\n          if (false)',
  ),
  edit(
    'a restricted miss reads as gone',
    index,
    'refusing.length === 0 &&\n          restricted.length === 0',
    'refusing.length === 0',
  ),
  edit('bind restricts nothing', bind, '      restricts,\n', '      restricts: [],\n'),
  edit(
    'a table-level foreign key is unseen',
    bind,
    'columns[0]?.name === column.name',
    'columns[0] === column',
  ),
  edit(
    'a foreign key that clears a restricted link is let through',
    bind,
    "declared === 'restrict' && action !== 'restrict'",
    "false && action !== 'restrict'",
  ),
  edit(
    'the writer is never asked to restrict',
    server,
    'Entity.restricting(write.input.entity).length > 0 && writer.restricts !== true',
    'false',
  ),
  edit(
    'a cascade into a restricted Entity is let through',
    server,
    'if (Entity.restricting(owner).length > 0) {',
    'if (false) {',
  ),
  edit(
    'a refusal is answered as 422',
    server,
    'Refusal.isTaken(error.refusal) || Refusal.isReferenced(error.refusal)',
    'Refusal.isTaken(error.refusal)',
  ),
  edit(
    'a restriction is filed as a cascade',
    entity,
    '  restrict: new WeakMap(),\n  setNull: new WeakMap(),\n}',
    '  restrict: new WeakMap(),\n  setNull: new WeakMap(),\n}\npointing.restrict.set = pointing.cascade.set.bind(pointing.cascade) as never',
  ),
  {
    name: "a delete's refusals leave referenced out",
    edits: [
      {
        file: descriptor,
        find: 'Schema.Union([...moved().members, referenced])',
        replace: 'moved()',
      },
    ],
    tests: clientTests,
  },
]
