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
    'a writer that judges no invariant is taken',
    server,
    'if (judged.length > 0 && writer.invariants !== true) {',
    'if (false) {',
  ),
  edit('the refusal names no rule', server, 'rule: refused.rule,', 'rule: Option.none(),'),
  edit('the refusal has no path', server, 'path: refused.path,', 'path: [],'),
  edit(
    'a plain write cannot be refused as invalid',
    '../../remote/src/mutation.ts',
    ': conflictOrInvalid) as unknown',
    ': Refusal.conflict) as unknown',
  ),
  edit(
    'a writer that judges no transition is taken',
    server,
    "...(write._tag === 'Update' ? Entity.transitions(write.input.entity) : []),",
    '',
  ),
  edit(
    'an insert needs a writer that judges transitions',
    server,
    "...(write._tag === 'Update' ? Entity.transitions(write.input.entity) : []),",
    '...Entity.transitions(write.input.entity),',
  ),
]
