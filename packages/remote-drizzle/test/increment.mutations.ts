/**
 * A declared write's increments, each step broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/increment.mutations.ts` checks
 * that a test fails for every one.
 */
const drizzle = '../src/index.ts'
const server = '../../remote-server/src/index.ts'
const guard = '../../guard/src/server.ts'
const entity = '../../entity/src/write.ts'
const tests = [
  'packages/remote-drizzle/test/increment.test.ts',
  'packages/guard/test/increment.test.ts',
  'packages/entity/test/write.test.ts',
  'packages/remote/test/precondition.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the writer leaves increments out of its SET',
    drizzle,
    '...(yield* incrementsOf(increments)),',
    '',
  ),
  edit(
    'the writer sets the amount rather than adding it',
    drizzle,
    'set[key] = sql`${column} + ${amount}`',
    'set[key] = sql`${amount}`',
  ),
  edit(
    'a row a revision on is taken as this increment having landed',
    drizzle,
    'if (incrementing) return Option.none()',
    '',
  ),
  edit(
    'a row holding the set values passes an unmet increment as its retry',
    drizzle,
    'const retried = sets && !incrementing && holdsWritten(row, values, links)',
    'const retried = sets && holdsWritten(row, values, links)',
  ),
  edit('the answer leaves the sum out', drizzle, '          ...Object.keys(increments),\n', ''),
  edit(
    'a writer that adds no increments is accepted',
    server,
    'if (write.increments.length > 0 && writer.increments !== true) {',
    'if (false) {',
  ),
  edit(
    'the server hands the writer no increments',
    server,
    'increments: bound.increments,',
    'increments: {},',
  ),
  edit(
    'an increment of a field not stored as a number is taken',
    entity,
    'if (!storedAsNumber(field.schema as unknown as Schema.Top)) {',
    'if (false) {',
  ),
  edit(
    'an amount that is not a number is taken',
    entity,
    'if (!storedAsNumber(amount))',
    'if (false)',
  ),
  edit(
    'keys does not narrow increments',
    entity,
    '      if (!asked(key)) continue\n      const schema',
    '      const schema',
  ),
  edit(
    'Write.writes leaves increments out',
    entity,
    '...write.increments.map(increment => increment.field),',
    '',
  ),
  edit(
    'the incremented member needs no Update rule',
    guard,
    '            ...Object.keys(context.increments),\n',
    '',
  ),
  edit(
    'the guard judges the row as it was, not with the sum',
    '../../entity/src/write.ts',
    "else if (typeof held === 'number') after[field] = held + amount",
    "else if (typeof held === 'number') after[field] = held",
  ),
  edit(
    'a guarded writer hides its writer’s increments',
    guard,
    '...(writer.increments === true ? { increments: true } : {}),',
    '',
  ),
  edit(
    'the writer refuses no fractional amount for an integer column',
    drizzle,
    '!integer && holdsIntegers(binding.columns[field.key])',
    'false',
  ),
  edit(
    'every number column holds integers',
    drizzle,
    'column !== undefined && /^number u?int\\d+$/.test(column.dataType)',
    "column !== undefined && column.dataType.startsWith('number')",
  ),
  edit(
    'only a 32-bit column holds integers',
    drizzle,
    'column !== undefined && /^number u?int\\d+$/.test(column.dataType)',
    "column !== undefined && column.dataType === 'number int32'",
  ),
  edit(
    'registration ignores what the writer refuses',
    server,
    'if (refused.length > 0) {',
    'if (false) {',
  ),
  edit(
    'a guarded writer hides what its writer refuses',
    guard,
    '...(writer.refuses?.(write) ?? []),',
    '',
  ),
  edit(
    'every amount reads as an integer',
    entity,
    'return Object.freeze({ key, field, integer })',
    'return Object.freeze({ key, field, integer: true })',
  ),
]
