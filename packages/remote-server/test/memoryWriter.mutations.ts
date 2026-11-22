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
    'a link through an onDelete relation is written whatever row it points at',
    'Option.isSome(relation.onDelete) ? [{ key, target: relation.target().name }] : []',
    '[]',
  ),
  edit(
    'an update writes a link whatever row it points at',
    '        yield* refuseGone(id, links)\n        const row = found.value',
    '        const row = found.value',
  ),
  edit(
    'an insert refuses a gone link before a taken id',
    '        if (Option.isSome(breaks)) return yield* breaks.value\n        if (Option.isSome(stored(id))) {',
    '        if (Option.isSome(breaks)) return yield* breaks.value\n        yield* refuseGone(id, links)\n        if (Option.isSome(stored(id))) {',
  ),
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
    'ensures === undefined ? invariants : [...invariants, ensures],',
    'ensures === undefined ? [] : [ensures],',
  ),
  edit(
    "the write's postcondition is not judged",
    'ensures === undefined ? invariants : [...invariants, ensures],',
    'invariants,',
  ),
  edit(
    'the revision does not move',
    "typeof revision === 'number' ? revision + 1 : revision",
    'revision',
  ),
  edit(
    'amounts and computations read the row after the values set',
    'Write.apply(\n                before,',
    'Write.apply(\n                { ...before, ...values },',
  ),
  edit(
    'a retry is never recognised',
    'holdsWritten(row, written)\n            ? answer(row)',
    'false\n            ? answer(row)',
  ),
  edit(
    'an invariant reads a stored link as its ref',
    "if (typeof ref === 'string') read[key] = refParts(ref).id",
    '',
  ),
  edit(
    'a retry whose when the write made false is refused',
    '          if (retried) return answer(row)\n',
    '',
  ),
  edit(
    'a taken id is refused before an invariant the insert breaks',
    `        if (Option.isSome(breaks)) return yield* breaks.value
        if (Option.isSome(stored(id))) {
          return yield* new RemoteTaken({ message: \`\${entity.name} \${id} is already taken\` })
        }`,
    `        if (Option.isSome(stored(id))) {
          return yield* new RemoteTaken({ message: \`\${entity.name} \${id} is already taken\` })
        }
        if (Option.isSome(breaks)) return yield* breaks.value`,
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
  edit('the writer declares no revision', '    revision: revisionField,\n', ''),
  edit(
    'an update expecting none leaves the revision where it was',
    '...(revisionField === undefined ? {} : movedOn(revisionField)),',
    '',
  ),
  edit(
    'an update does not answer the revision it moved',
    '...(revisionField === undefined ? [] : [revisionField]),',
    '',
  ),
  edit(
    'a revision naming no field is taken',
    'if (revisionField !== undefined && !Object.hasOwn(entity.fields, revisionField)) {',
    'if (false) {',
  ),
]
