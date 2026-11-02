/**
 * A declared cascade (#343), each step from the declaration to the answer
 * broken in turn: `pnpm mutate packages/remote-drizzle/test/cascade.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/cascade.test.ts']
const entityTests = ['packages/entity/test/cascade.test.ts', ...tests]
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
  edit('a delete that missed still takes the rest', '../src/index.ts', ' and ${gone}`)', '`)'),
  edit(
    'every row removed is named, seen or not',
    '../src/index.ts',
    ".filter(row => Number(row['seen']) === 1)",
    '.filter(() => true)',
  ),
  edit(
    'no row removed is named',
    '../src/index.ts',
    ".filter(row => Number(row['seen']) === 1)",
    '.filter(() => false)',
  ),
  edit("D1 reads a batch's column named 1 first", '../src/index.ts', ").as('seen'),", '),'),
  edit(
    'a table cascading unseen by the domain is bound',
    '../src/bind.ts',
    "if (action === 'cascade' && !declared)",
    'if (false)',
  ),
  edit(
    'a table refusing a declared cascade is bound',
    '../src/bind.ts',
    "if (declared && action !== 'cascade')",
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
    '[...before, ...cascaded.flatMap(pointedBy)]',
    'before',
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
]
