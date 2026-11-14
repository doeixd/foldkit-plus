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
    '[...held.before, ...held.after].some(key => readRuled(ruled, key)),',
    'false,',
  ),
  edit(
    'every invariant is unnamed',
    '[...held.before, ...held.after].some(key => readRuled(ruled, key)),',
    'true,',
  ),
  edit(
    'an update is told as its writer said',
    'told(context.ensures),\n        ),',
    'error => error,\n        ),',
  ),
  edit(
    'a guarded writer hides that its writer judges postconditions',
    '...(writer.postconditions === true ? { postconditions: true } : {}),',
    '',
  ),
  edit(
    'a postcondition over a hidden member is named',
    '(ensures !== undefined && rule === ensures.id && readsRuled(ensures)),',
    'false,',
  ),
]
