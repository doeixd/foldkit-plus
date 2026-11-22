/**
 * A write as a transition, and `Write.apply` through metakit, each broken in
 * turn: `pnpm mutate packages/entity/test/writeTransition.mutations.ts`.
 */
const transition = '../src/writeTransition.ts'
const write = '../src/write.ts'
const transitionTests = [
  'packages/entity/test/writeTransition.test.ts',
  'packages/entity/test/writeTransition.differential.test.ts',
]
const applyTests = ['packages/entity/test/writeApply.test.ts']
const edit = (
  file: string,
  tests: ReadonlyArray<string>,
  name: string,
  find: string,
  replace: string,
) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const inTransition = (name: string, find: string, replace: string) =>
  edit(transition, transitionTests, name, find, replace)

export default [
  inTransition(
    'an insert applies where the row is there',
    "Match.when('Insert', () => Node.Call({ op: Bool.notOp, args: [present] }))",
    "Match.when('Insert', () => present)",
  ),
  inTransition(
    'an update applies where no row is',
    'Match.orElse(() => present)',
    'Match.orElse(() => Node.Lit({ value: true }))',
  ),
  inTransition(
    'a write lands at a revision it did not expect',
    'op: Eq.equalsOp,',
    'op: Eq.isNotOp,',
  ),
  inTransition(
    'a decrement adds its amount',
    "const by = direction === 'decrement' ? Node.Call({ op: Num.negOp, args: [amount] }) : amount",
    'const by = amount',
  ),
  inTransition(
    'an increment is a set',
    'way: Transition.Way.add({ amount: by })',
    'way: Transition.Way.set()',
  ),
  inTransition(
    'a delete sets present',
    "Node.Lit({ value: write._tag === 'Insert' })",
    'Node.Lit({ value: true })',
  ),
  inTransition(
    'the revision is not moved on',
    "return typeof held === 'number' ? held + 1 : null",
    'return held',
  ),
  inTransition(
    'a key left out is written as null',
    'mayBeLeftOut(inputFields[each.key]!) ? optional(each) : inputOf(each.key)',
    'inputOf(each.key)',
  ),
  inTransition(
    'a nullable field is kept where its key is null, though null was given',
    'if (!holdsNull(field.schema as Schema.Top)) {',
    'if (true) {',
  ),
  inTransition(
    'a link is not written',
    '...write.links.map(({ key, relation }) => set(',
    '...[].map(({ key, relation }: never) => set(',
  ),
  inTransition(
    'the write’s precondition is dropped',
    '...conditions.map(node => underState(write, node)),',
    '',
  ),
  inTransition(
    'a computed field is not written',
    '...write.assignments.map(({ field }, at) =>',
    '...[].map(({ field }: never, at: number) =>',
  ),
  inTransition(
    'a context value is supplied as null',
    "writes.push(set(['row', each.member.key], read(['supplied', name], schema)))",
    "writes.push(set(['row', each.member.key], Node.Lit({ value: null })))",
  ),
  inTransition(
    'the viewer is supplied as a visitor',
    'supplied[name] = Option.getOrNull(viewerIdOf(entity, by))',
    'supplied[name] = null',
  ),
  edit(
    write,
    applyTests,
    'a refused value is written as null',
    'if (Node.isRefusal(value)) throw refusedBy(value)',
    'if (Node.isRefusal(value)) return null',
  ),
  edit(
    write,
    applyTests,
    'a null amount is no number',
    "if (held === null || typeof held === 'number') {",
    "if (typeof held === 'number') {",
  ),
  edit(
    write,
    applyTests,
    'a collation’s fold is not bound',
    'Computation.Call({ operator: lowerAsciiName, args: [arg] })',
    'arg',
  ),
  edit(
    write,
    applyTests,
    'a fold named on the wire is looked up in the table',
    'if (operator === lowerAsciiName) {',
    'if (false) {',
  ),
]
