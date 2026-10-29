/**
 * Write rules over paths, judged in the write's statement, each step broken
 * in turn: `pnpm mutate packages/guard/test/pathWriteRule.mutations.ts`.
 */
const tests = ['packages/guard/test/pathWriteRule.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const drizzle = '../../remote-drizzle/src/index.ts'
const server = '../src/server.ts'
const condition = '../src/condition.ts'

export default [
  edit(
    'an update is not held to its rule in the statement',
    drizzle,
    '          ...required,\n',
    '',
  ),
  edit(
    'a delete is not held to its rule in the statement',
    drizzle,
    '        const where = and(at.where, ...required)',
    '        const where = at.where',
  ),
  edit(
    'an update its rule refused is told as a miss',
    drizzle,
    '        // Who may write it is refused first, as a guard refuses before all else.\n        yield* refusedBy(id, requires, required)',
    '',
  ),
  edit(
    'a write may change what its rule reads of its own row',
    server,
    'if (read.some(key => !sameStored(before[key], after[key]))) {',
    'if (false) {',
  ),
  edit(
    'a writer that cannot judge the rule is wrapped anyway',
    server,
    'if (reaching.length > 0 && writer.requires !== true) {',
    'if (false) {',
  ),
  edit(
    'an exists reached through a path reads nothing of its own row',
    condition,
    'Exists: ({ via }) => via.slice(0, 1).map(relation => relation.key),',
    'Exists: () => [],',
  ),
  edit(
    "a path from the viewer reads nothing of the viewer's own row",
    condition,
    '? [via[0]?.key ?? field.key]',
    '? []',
  ),
  edit(
    'a path from the viewer to a field of their row reads nothing of it',
    condition,
    '? [via[0]?.key ?? field.key]',
    '? via.slice(0, 1).map(relation => relation.key)',
  ),
  edit(
    "every row of the viewer's Entity is taken for theirs",
    condition,
    'Option.exists(viewerIdOf(start, context), id => id === written.id)',
    'Option.exists(viewerIdOf(start, context), () => true)',
  ),
  edit(
    "a row of another Entity is taken for the viewer's",
    condition,
    'return start.name === written.entity &&',
    'return true &&',
  ),
  edit(
    'what the rule reads of the row by a path is not read before the write',
    server,
    '...Condition.reachedFrom(rules.row.condition, { entity: entity.name, id: context.id }),',
    '',
  ),
  edit(
    'one row decides a rule that reads another, as false',
    condition,
    '          reachesOther(row.guard)',
    '          false',
  ),
  edit(
    'may answers what one row cannot decide, as false',
    condition,
    'Row: () => Option.none(),',
    'Row: () => Option.some(false),',
  ),
  {
    // This file attaches such a rule at load, so the attach test says it.
    name: 'an Update rule may not read another row',
    edits: [
      {
        file: '../src/attach.ts',
        find: "const reachingSurfaces = new Set(['Read', 'Update', 'Delete'])",
        replace: "const reachingSurfaces = new Set(['Read'])",
      },
    ],
    tests: ['packages/guard/test/viewerRule.test.ts'],
  },
]
