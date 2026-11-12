/**
 * A link a delete clears (#467), each piece broken:
 * `pnpm mutate packages/remote-drizzle/test/setNull.mutations.ts`.
 */
const writerTests = ['packages/remote-drizzle/test/setNull.test.ts']
const guardTests = ['packages/guard/test/setNull.test.ts']
const index = '../src/index.ts'
const bind = '../src/bind.ts'
const server = '../../remote-server/src/index.ts'
const guard = '../../guard/src/server.ts'
const entity = '../../entity/src/index.ts'
const client = '../../remote/src/mutation.ts'
const lawTests = [...writerTests, ...guardTests]
const selectCleared = `        ...clearing.map(({ edge, visible }) =>
          db
            .select({ id: idColumn(edge.owner), seen: seenFlag(visible) })
            .from(edge.owner.table)
            .where(sql\`\${edge.column} = \${id}\`),
        ),
`
const edit = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string> = writerTests,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  edit(
    'no link is cleared',
    index,
    '.where(sql`${edge.column} = ${id} and ${taken}`)',
    '.where(sql`false`)',
  ),
  edit(
    'a link is cleared though the delete misses',
    index,
    '.where(sql`${edge.column} = ${id} and ${taken}`)',
    '.where(sql`${edge.column} = ${id}`)',
  ),
  edit(
    'a cleared row hidden from its asker is named',
    index,
    '.select({ id: idColumn(edge.owner), seen: seenFlag(visible) })',
    '.select({ id: idColumn(edge.owner), seen: seenFlag(undefined) })',
  ),
  {
    // The old order: each cleared row judged once its link is cleared (every
    // doc here starts in a folder, so the null links are the cleared ones).
    name: 'a cleared row is judged visible after its link is cleared',
    edits: [
      { file: index, find: selectCleared, replace: '' },
      {
        file: index,
        find: '        // Each row the cascade takes is judged before anything is removed: one',
        replace: `${selectCleared.replace('${edge.column} = ${id}', '${edge.column} is null')}        // Each row the cascade takes is judged before anything is removed: one`,
      },
      {
        file: index,
        find: '(results[seen.length + at] ?? [])\n            .filter',
        replace: '(results[seen.length + clearing.length + at] ?? [])\n            .filter',
      },
      {
        file: index,
        find: 'return (results[seen.length + clearing.length + at] ?? [])',
        replace: 'return (results[seen.length + at] ?? [])',
      },
    ],
    tests: writerTests,
  },
  edit(
    'a cleared row is not held to its rule',
    index,
    '...(yield* clearRefusals(id, clearing)),',
    '',
  ),
  edit(
    'a rule unknown for a cleared row lets it through',
    index,
    'where (${pointing}) and (${rule}) is not true',
    'where (${pointing}) and (${rule}) = false',
  ),
  edit(
    'a delete with only clears runs one statement',
    index,
    'Option.isNone(plan) && clears.length === 0',
    'Option.isNone(plan)',
  ),
  edit('bind clears nothing', bind, '      clears,\n', '      clears: [],\n'),
  edit(
    'a foreign key that sets null binds where the domain clears nothing',
    bind,
    "(action === 'set null' || action === 'set default') && declared !== 'setNull'",
    'false',
  ),
  edit(
    'the writer is never asked to clear',
    server,
    'cleared.length > 0 && writer.clears !== true',
    'false',
  ),
  edit(
    'a cascade into a cleared Entity is let through',
    server,
    'if (Entity.clearing(owner).length > 0) {',
    'if (false) {',
  ),
  edit(
    'the answer does not read a cleared row again',
    server,
    '                        ...cleared,\n',
    '',
    ['packages/remote-server/test/pointed.test.ts'],
  ),
  edit(
    'the guard hands over no clearing rules',
    guard,
    '...(clearJudging.length === 0 ? {} : { clearing }),',
    '',
    guardTests,
  ),
  edit(
    "the guard leaves the link's Unlink rule out",
    guard,
    'const rules = [row, ...unlinks.flatMap(Option.toArray)]',
    'const rules = [row]',
    guardTests,
  ),
  edit(
    "the guard passes on a writer's clears unasked",
    guard,
    '...(writer.clears === true ? { clears: true } : {}),',
    '',
    guardTests,
  ),
  edit(
    'a required link may be cleared',
    entity,
    "if (onDelete === 'setNull' && options?.optional !== true)",
    'if (false)',
    ['packages/entity/test/cascade.test.ts'],
  ),
  edit('the page shows no link cleared', client, '    ...cleared,\n  ]', '  ]', lawTests),
  edit(
    'the page clears a link to another row',
    client,
    'entry.values[relation.key] !== at',
    'false',
    writerTests,
  ),
  edit(
    "the page lets through a delete a held doc's rules refuse",
    client,
    '.pipe(Option.orElse(clearing))',
    '',
    guardTests,
  ),
]
