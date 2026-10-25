/**
 * Invariants under a guard, each step broken in turn:
 * `pnpm mutate packages/guard/test/invariant.mutations.ts` checks that a test
 * fails for every one.
 */
const file = '../src/server.ts'
const tests = ['packages/guard/test/invariant.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a guarded writer hides that its writer judges invariants',
    '...(writer.invariants === true ? { invariants: true } : {}),',
    '',
  ),
  edit(
    'an invariant over a hidden member is named',
    '.filter(held => [...held.before, ...held.after].some(key => readRuled(ruled, key)))',
    '.filter(() => false)',
  ),
  edit(
    'every invariant is unnamed',
    '.filter(held => [...held.before, ...held.after].some(key => readRuled(ruled, key)))',
    '.filter(() => true)',
  ),
  edit(
    'an update is told as its writer said',
    '          told,\n        ),',
    '          error => error,\n        ),',
  ),
]
