/**
 * A declared write's `when`, each step broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/precondition.mutations.ts`
 * checks that a test fails for every one.
 */
const drizzle = '../src/index.ts'
const server = '../../remote-server/src/index.ts'
const guard = '../../guard/src/server.ts'
const tests = [
  'packages/remote-drizzle/test/precondition.test.ts',
  'packages/guard/test/pinned.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'an update without expect leaves the precondition out of its WHERE',
    drizzle,
    'return { where: and(eq(idColumn(binding), id), ...holding), bump: {} }',
    'return { where: eq(idColumn(binding), id), bump: {} }',
  ),
  edit(
    'an update with expect leaves the precondition out of its WHERE',
    drizzle,
    'where: and(eq(idColumn(binding), id), eq(column, revision), ...holding),',
    'where: and(eq(idColumn(binding), id), eq(column, revision)),',
  ),
  edit(
    'an update’s miss is not read back when only the precondition could explain it',
    drizzle,
    '          Option.isSome(when) ||\n          invariants.length > 0 ||',
    '          invariants.length > 0 ||',
  ),
  edit(
    'an unmet update reads as a conflict',
    drizzle,
    'if (retried) return now',
    'return Option.none()',
  ),
  edit('a landed write’s retry is unmet', drizzle, 'if (retried) return now', ''),
  {
    ...edit(
      'a write with no precondition, missed at its revision, is unmet',
      drizzle,
      'if (Option.isNone(when)) return Option.none()',
      '',
    ),
    survives:
      'only a race reaches it: a write expecting a revision misses while the row is at that revision, between the statement and its re-read',
  },
  edit(
    'a delete’s miss is not read back when only the precondition could explain it',
    drizzle,
    "if (Option.isNone(expect) && Option.isNone(when) && requires === undefined) return 'absent'",
    "if (Option.isNone(expect) && requires === undefined) return 'absent'",
  ),
  edit('an unmet delete reads as moved', drizzle, 'Option.isNone(when) ||', 'true ||'),
  edit(
    'a writer that checks no precondition is accepted',
    server,
    'if (Option.isSome(write.when) && writer.preconditions !== true) {',
    'if (false) {',
  ),
  edit(
    'an unmet write is refused as a conflict',
    server,
    "{ _tag: 'Unmet' },",
    "{ _tag: 'Conflict' },",
  ),
  edit(
    'a guarded writer hides its writer’s preconditions',
    guard,
    '...(writer.preconditions === true ? { preconditions: true } : {}),',
    '',
  ),
  edit(
    'a write that sets nothing passes as its own retry',
    drizzle,
    'const sets = Object.keys(values).length + Object.keys(links).length > 0',
    'const sets = true',
  ),
  edit(
    'an unmet answer from a writer of a write with no precondition is a refusal',
    server,
    'Option.isNone(write.when)\n',
    'false\n',
  ),
]
