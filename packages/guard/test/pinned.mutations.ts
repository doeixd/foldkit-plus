/**
 * A guarded write's revision pin, each step broken in turn:
 * `pnpm mutate packages/guard/test/pinned.mutations.ts` checks that a test
 * fails for every one.
 */
const file = '../src/server.ts'
const tests = ['packages/guard/test/pinned.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'an update is not pinned',
    'return yield* writer.update({\n                    ...context,\n                    expect: pin(context.expect, current.value),',
    'return yield* writer.update({\n                    ...context,\n                    expect: context.expect,',
  ),
  edit(
    'a delete is not pinned',
    'return yield* writer.delete({\n                  ...context,\n                  expect: pin(context.expect, current.value),',
    'return yield* writer.delete({\n                  ...context,\n                  expect: context.expect,',
  ),
  edit('a miss is not decided again', '? loop(left - 1)', '? Effect.succeed(outcome)'),
  edit('two attempts, not three', 'return loop(3)', 'return loop(2)'),
  edit('an input’s pinned write is retried', 'if (Option.isSome(expect)) {', 'if (false) {'),
  edit(
    'an update ignores the revision its input expects',
    'if (moved(context.expect, current.value)) return Option.none()',
    '',
  ),
  edit(
    'a delete ignores the revision its input expects',
    "if (moved(context.expect, current.value)) return 'moved' as const",
    '',
  ),
  edit(
    'validate does not warn',
    'pins.set(guarded, Option.fromUndefinedOr(revision))',
    "pins.set(guarded, Option.some('revision'))",
  ),
  edit(
    'an input expecting another field than the pin is written',
    'return expect.value.field === revision',
    'return true',
  ),
  edit(
    'a revision not stored as a number is taken',
    'if (!SchemaAST.isNumber(Schema.toEncoded(field.schema).ast)) {',
    'if (false) {',
  ),
  edit(
    'validate takes an expect the writer does not pin',
    'Option.exists(pin, field => field !== expected)',
    'false',
  ),
  edit(
    'an unpinned insert is named, with no row to race',
    'Insert: () => false,',
    'Insert: () => true,',
  ),
  edit(
    'an unpinned delete is named though nothing updates its Entity',
    'Delete: () => updated.has(writes.entity),',
    'Delete: () => true,',
  ),
  edit(
    'an unpinned delete beside an update is not named',
    'Delete: () => updated.has(writes.entity),',
    'Delete: () => false,',
  ),
  edit('an unpinned update is not named', 'Update: () => true,', 'Update: () => false,'),
]
