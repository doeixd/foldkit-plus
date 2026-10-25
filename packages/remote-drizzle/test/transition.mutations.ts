/**
 * Transitions in the Drizzle writer, each step broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/transition.mutations.ts` checks
 * that a test fails for every one.
 */
const drizzle = '../src/index.ts'
const tests = ['packages/remote-drizzle/test/transition.test.ts']
const edit = (name: string, find: string, replace: string, file = drizzle) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the statement does not judge the change',
    '[Expr.substituteNext(held.predicate, values)]',
    '[held.predicate]',
  ),
  edit('a moved field is judged as unmoved', 'next[field] = movedBy(field, amount)', ''),
  edit(
    'a miss is never classified by a transition',
    'brokenBy(DomainEntity.judgeChangeAgainst(transitions, row, proposed)),',
    'Option.none(),',
  ),
  edit(
    'a miss is not read back for a transition',
    '          transitions.length > 0',
    '          false',
  ),
  edit(
    'a miss reads no field a transition reads',
    '...transitions.flatMap(held => [...held.before, ...held.after]),',
    '',
  ),
  edit(
    'a transition the database cannot run is found at the first write',
    '  for (const held of transitions)\n    compilePredicates(',
    '  for (const held of [] as typeof transitions)\n    compilePredicates(',
  ),
  edit(
    'a binding keeps no transition',
    'transitions: Domain.Entity.transitions(entity),',
    'transitions: [],',
    '../src/bind.ts',
  ),
  {
    ...edit(
      'a transition over a hidden member is named',
      '.filter(held => [...held.before, ...held.after].some(key => readRuled(ruled, key)))',
      '.filter(() => false)',
      '../../guard/src/server.ts',
    ),
    tests: ['packages/guard/test/invariant.test.ts'],
  },
]
