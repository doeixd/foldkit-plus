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
    'ref.columns[0]?.name !== column.name',
    'ref.columns[0] !== column',
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
  edit(
    'a delete needs nothing of the store for what points at its row',
    server,
    '      ...pointing,\n',
    '',
  ),
  edit(
    'a link is not held to the store',
    server,
    "        judged: linking(relation, 'in-statement'),\n      })),",
    "        judged: linking(relation, 'in-statement'),\n      })).filter(() => false),",
  ),
  edit(
    'a foreign key is not read as holding a link',
    server,
    "constrained(relation) ? 'constraint' : judged",
    'judged',
  ),
  edit(
    "a link the write's context sets is not held to the store",
    server,
    'Relation: relation => [relation],',
    'Relation: (): ReadonlyArray<LinkRelation> => [],',
  ),
  edit(
    'a writer that does not check a link is let through',
    server,
    'if (unchecked.length > 0 && writer.checksTargets !== true) {',
    'if (false) {',
  ),
  edit(
    'an insert lands whether its topic is there or not',
    index,
    'Arr.isReadonlyArrayNonEmpty(targets)\n              ? into.select(insertedWhile(set, targets))',
    'false\n              ? into.select(insertedWhile(set, targets))',
  ),
  edit(
    'an insert that checks its link writes null over the table defaults',
    index,
    '                  : undefined\n        if (value !== undefined)\n          fields[key] = is(value, SQL) ? value : sql`${sql.param(value, column)}`',
    '                  : sql`null`\n        if (value !== undefined)\n          fields[key] = is(value, SQL) ? value : sql`${sql.param(value, column)}`',
  ),
  edit(
    'an update relinks whether its topic is there or not',
    index,
    '          ...targets.map(({ exists }) => exists),\n',
    '',
  ),
  edit(
    'a missed link reads as taken',
    index,
    '          if (taken.length === 0) {\n            yield* refuseGone(id, targets)',
    '          if (false) {\n            yield* refuseGone(id, targets)',
  ),
  edit(
    'a taken id whose link is gone reads as gone',
    index,
    '          if (taken.length === 0) {\n            yield* refuseGone(id, targets)',
    '          if (true) {\n            yield* refuseGone(id, targets)',
  ),
  edit('bind guards no link', bind, '      guards,\n', '      guards: [],\n'),
  edit(
    'the writer reads no foreign key',
    bind,
    'if (Option.isSome(onDeleteOf(config.table, link.field, targetCheck))) keyed.push(field)',
    '',
  ),
  edit(
    'a SQLite foreign key is taken to hold',
    index,
    '      !is(owner.table, SQLiteTable) &&\n',
    '',
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
