/**
 * The memory writer, each decision it makes broken in turn:
 * `pnpm mutate packages/remote-server/test/memoryWriter.mutations.ts` checks
 * that a test fails for every one.
 */
const writer = '../src/memoryWriter.ts'
const tests = [
  'packages/remote-server/test/memoryWriter.test.ts',
  'packages/remote-drizzle/test/memoryWriterParity.test.ts',
]
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: writer, find, replace }],
  tests,
})

export default [
  edit(
    'an update ignores the revision it expects',
    'if (Option.isSome(expect) && !sameStored(row[expect.value.field], expect.value.revision)) {',
    'if (false) {',
  ),
  edit('a delete ignores the revision it expects', 'return DeleteOutcome.Moved()', '{}'),
  edit('an update ignores its when', 'if (!(yield* holds(row, when))) {', 'if (false) {'),
  edit('a delete ignores its when', 'if (!(yield* holds(row, when))) return yield* unmet(id)', ''),
  edit(
    'no invariant is judged',
    'Entity.judgeAgainst(invariants, change, operators)',
    'Entity.judgeAgainst([], change, operators)',
  ),
  edit(
    'the revision does not move',
    "typeof revision === 'number' ? revision + 1 : revision",
    'revision',
  ),
  edit(
    'amounts and computations read the row after the values set',
    'Write.apply(\n          before,',
    'Write.apply(\n          { ...before, ...values },',
  ),
  edit(
    'a retry is never recognised',
    'holdsWritten(row, written)\n            ? answer(row)',
    'false\n            ? answer(row)',
  ),
  edit(
    'an insert over a taken id overwrites it',
    'if (Option.isSome(stored(id))) {',
    'if (false) {',
  ),
  edit(
    'a link is stored as the id it points at',
    'Option.getOrNull(Option.map(link, ref => entityKey(ref.entity, ref.id))),',
    'Option.getOrNull(Option.map(link, ref => ref.id)),',
  ),
]
