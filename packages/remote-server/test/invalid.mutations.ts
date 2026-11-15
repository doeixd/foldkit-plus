/**
 * An invariant's refusal, each step broken in turn:
 * `pnpm mutate packages/remote-server/test/invalid.mutations.ts` checks that a
 * test fails for every one.
 */
const server = '../src/index.ts'
const tests = ['packages/remote-server/test/invalid.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'any invalid refusal matches every invariant',
    '../../remote/src/mutationDescriptor.ts',
    '    Option.contains(refusal.rule, invariant.id),',
    '    true,',
  ),
  edit(
    'an unnamed refusal matches every invariant',
    '../../remote/src/mutationDescriptor.ts',
    'Option.contains(refusal.rule, invariant.id)',
    'Option.getOrElse(Option.map(refusal.rule, rule => rule === invariant.id), () => true)',
  ),
  edit(
    'a declared invariant carries no id',
    '../../entity/src/invariant.ts',
    'id: { value: id, enumerable: true },',
    "id: { value: '', enumerable: true },",
  ),
  edit(
    'a writer that judges no invariant is taken',
    server,
    'if (declared.length > 0 && writer.invariants !== true) {',
    'if (false) {',
  ),
  edit('the refusal names no rule', server, 'rule: refused.rule,', 'rule: Option.none(),'),
  edit('the refusal has no path', server, 'path: refused.path,', 'path: [],'),
  edit(
    'a plain write cannot be refused as invalid',
    '../../remote/src/mutationDescriptor.ts',
    'conflictUnmetOrInvalid : conflictOrInvalid)',
    'conflictUnmetOrInvalid : conflict)',
  ),
  edit(
    'a writer that judges no transition is taken',
    server,
    'held => kind.hasBefore || !Entity.readsBefore(held),',
    'held => !Entity.readsBefore(held),',
  ),
  edit(
    'an insert needs a writer that judges transitions',
    server,
    'held => kind.hasBefore || !Entity.readsBefore(held),',
    'held => true || held,',
  ),
  ...[
    [
      'a writer that judges no postcondition is taken',
      'if (Option.isSome(write.ensures) && writer.postconditions !== true) {',
      'if (false) {',
    ],
    [
      'an update is handed no postcondition',
      '                      when: yield* when,\n                      ensures: Option.getOrUndefined(write.ensures),',
      '                      when: yield* when,',
    ],
    [
      'an insert is handed no postcondition',
      '                      request: yield* request,\n                      ensures: Option.getOrUndefined(write.ensures),',
      '                      request: yield* request,',
    ],
    [
      'an insert leaving unset what its postcondition reads is taken',
      'const judged = [...declared, ...Option.toArray(write.ensures)]',
      'const judged = declared',
    ],
  ].map(([name, find, replace]) => ({
    name: name!,
    edits: [{ file: server, find: find!, replace: replace! }],
    tests: ['packages/remote-server/test/memoryWriter.test.ts'],
  })),
]
