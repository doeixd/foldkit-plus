/**
 * A declared cascade (#343), each step from the declaration to the answer
 * broken in turn: `pnpm mutate packages/remote-drizzle/test/cascade.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/cascade.test.ts']
const entityTests = ['packages/entity/test/cascade.test.ts', ...tests]
const guardTests = ['packages/guard/test/cascade.test.ts']
const edit = (name: string, file: string, find: string, replace: string, at = tests) => ({
  name,
  edits: [{ file, find, replace }],
  tests: at,
})

export default [
  edit(
    'a relation forgets what it was declared to do on delete',
    '../../entity/src/entity.ts',
    'onDelete: spec.onDelete,',
    'onDelete: Option.none(),',
    entityTests,
  ),
  edit(
    'nothing is registered as cascading',
    '../../entity/src/entity.ts',
    "if (member._tag === 'Relation' && Option.isSome(member.onDelete))",
    'if (false)',
    entityTests,
  ),
  edit(
    "the root's own rows are not followed",
    '../src/cascade.ts',
    'if (step.binding === root) seeds.push(',
    'if (false) seeds.push(',
  ),
  edit(
    "a row of the root's own cascade takes nothing with it",
    '../src/cascade.ts',
    '...(upstream === undefined ? [] : [sql`${column} in (${removed(upstream, id)})`]),',
    '',
  ),
  edit(
    'a cascade into its own Entity stops after one step',
    '../src/cascade.ts',
    'if (step.self.length === 0) return base',
    'return base',
  ),
  edit(
    'a cascade back through another Entity is taken',
    '../src/cascade.ts',
    'if (visiting.includes(edge.owner))',
    'if (false)',
  ),
  edit(
    'a delete that missed still takes the rest',
    '../src/index.ts',
    'const taken = sql`exists (select 1 from ${binding.table} where ${rootWhere ?? sql`1 = 1`})`',
    'const taken = sql`exists (select 1 from ${binding.table} where ${where ?? sql`1 = 1`})`',
  ),
  edit(
    'a delete of a row that is not there still takes its children',
    '../src/index.ts',
    'in (${removedBy(step)}) and ${taken}`)',
    'in (${removedBy(step)})`)',
  ),
  edit(
    'every row removed is named, seen or not',
    '../src/index.ts',
    ".filter(row => Number(row['seen']) === 1)\n          .map((row): CascadedRow",
    '.filter(() => true)\n          .map((row): CascadedRow',
  ),
  edit(
    'no row removed is named',
    '../src/index.ts',
    ".filter(row => Number(row['seen']) === 1)\n          .map((row): CascadedRow",
    '.filter(() => false)\n          .map((row): CascadedRow',
  ),
  edit(
    "D1 reads a batch's column named 1 first",
    '../src/index.ts',
    "then 1 else 0 end`).as('seen')",
    'then 1 else 0 end`)',
  ),
  edit(
    'a table cascading unseen by the domain is bound',
    '../src/bind.ts',
    "if (action === 'cascade' && declared !== 'cascade')",
    'if (false)',
  ),
  edit(
    'a table refusing a declared cascade is bound',
    '../src/bind.ts',
    "if (declared === 'cascade' && action !== 'cascade')",
    'if (false)',
  ),
  edit(
    'a writer that removes nothing more is taken',
    '../../remote-server/src/index.ts',
    'if (cascadePointers.size > 0 && writer.cascades !== true) {',
    'if (false) {',
  ),
  edit(
    'the answer names only the row asked for',
    '../../remote-server/src/index.ts',
    '...cascaded.map(({ entity, id }) => ({ entity, id })),',
    '',
  ),
  edit(
    'the answer re-reads nothing a removed row pointed at',
    '../../remote-server/src/index.ts',
    '                        ...cascaded.flatMap(pointedBy),\n',
    '',
  ),
  edit(
    'the client shows only the row asked for gone',
    '../../remote/src/mutation.ts',
    '    ...cascaded,\n',
    '',
  ),
  edit(
    'the client moves no count over a removed row',
    '../../remote/src/mutation.ts',
    'context.derived.get(row.entity) ?? [],',
    '[],',
  ),
  edit(
    'a guarded writer hides that its writer cascades',
    '../../guard/src/server.ts',
    '...(writer.cascades === true ? { cascades: true } : {}),',
    '',
    ['packages/guard/test/cascade.test.ts'],
  ),
  // #348: who may let a cascade take a row.
  edit(
    'the rows a cascade takes are not judged',
    '../src/index.ts',
    'const rootWhere = and(where, ...refusing.map(({ refused }) => sql`not exists (${refused})`))',
    'const rootWhere = and(where)',
  ),
  edit(
    'the row named is deleted though a row its cascade would take is refused',
    '../src/index.ts',
    '.where(rootWhere)',
    '.where(where)',
  ),
  edit(
    'a rule unknown for a row lets the cascade take it',
    '../src/index.ts',
    'in (${judged}) and (${rule}) is not true`',
    'in (${judged}) and (${rule}) = false`',
  ),
  edit(
    "authorizedBy: 'parent' is judged all the same",
    '../src/cascade.ts',
    "const judged = edge.authorizedBy === 'child'",
    'const judged = true',
  ),
  edit(
    "a row reached through a parent's relation is judged",
    '../src/cascade.ts',
    '        step.from.filter(edge => edge.judged),',
    '        step.from,',
  ),
  edit(
    "a reply to the row named is not judged, only a reply's reply",
    '../src/cascade.ts',
    '...(step.binding === root ? [sql`${column} = ${id}`] : []),',
    '',
  ),
  edit(
    'a refused cascade answers as a row that is gone',
    '../src/index.ts',
    'requires === undefined &&\n          refusing.length === 0',
    'requires === undefined',
  ),
  edit(
    'a refused cascade answers as a row that moved',
    '../src/index.ts',
    'for (const { step, reason, refused, would } of refusing) {',
    'for (const { step, reason, refused, would } of []) {',
  ),
  edit(
    "a refusal drops its rule's words",
    '../src/index.ts',
    'onSome: said => `It would ${would}: ${said}`,',
    'onSome: () => `It would ${would}`,',
  ),
  edit(
    'the guard hands its writer no rule for the rows a cascade takes',
    '../../guard/src/server.ts',
    '...(judging.length === 0 ? {} : { cascading }),',
    '',
    guardTests,
  ),
  edit(
    'a guarded writer is made without the Entity whose rules judge what it takes',
    '../../guard/src/server.ts',
    'if (guarded === undefined)\n          throw new Error(\n            `[foldkit-guard] GuardServer.writer: a delete of ${root.name} takes',
    'if (false)\n          throw new Error(\n            `[foldkit-guard] GuardServer.writer: a delete of ${root.name} takes',
    guardTests,
  ),
  edit(
    'a guarded writer takes a child nothing judges',
    '../../guard/src/server.ts',
    'if (unused.length > 0)',
    'if (false)',
    guardTests,
  ),
  edit(
    "the guard judges rows taken under their parent's rule",
    '../../guard/src/server.ts',
    "const own = Option.getOrElse(relation.authorizedBy, () => 'child' as const) === 'child'",
    'const own = true',
    guardTests,
  ),
  edit(
    'a guarded writer judges through a writer that cannot',
    '../../guard/src/server.ts',
    'if (judging.length > 0 && (writer.requires !== true || writer.cascades !== true)) {',
    'if (false) {',
    guardTests,
  ),
  edit(
    'the page does not judge the rows a delete takes',
    '../../remote/src/mutation.ts',
    '.filter(row => row.judged)',
    '.filter(() => false)',
    guardTests,
  ),
  edit(
    "the page judges rows taken under their parent's rule",
    '../../remote/src/mutation.ts',
    "const judged = Option.getOrElse(relation.authorizedBy, () => 'child') === 'child'",
    'const judged = true',
    guardTests,
  ),
  edit(
    "the page refuses in its own words, not the server's",
    '../../remote/src/mutation.ts',
    'onSome: said => `It would delete a ${row.entity} you may not delete: ${said}`,',
    'onSome: said => said,',
    guardTests,
  ),
]
