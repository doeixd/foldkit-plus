/**
 * A read of a path a resume part restores (a Remote store `Remote.resume`
 * carries) is covered by that part and by nothing else, each step broken in
 * turn: `pnpm mutate packages/ssr/test/partCover.mutations.ts` checks that a
 * test fails for each.
 */
const index = '../src/index.ts'
const tests = [
  'packages/ssr/test/coverage.test.ts',
  'packages/ssr/test/parts.test.ts',
  'packages/ssr/test/family.test.ts',
]
const find = "  if (plan.parts.some(part => (part.restores ?? []).some(contains))) return 'part'"

export default [
  {
    name: 'a path no part restores is covered as if one did',
    edits: [{ file: index, find, replace: "  if (plan.parts.length >= 0) return 'part'" }],
    tests,
  },
  {
    name: 'a path a part restores is not covered by it',
    edits: [{ file: index, find, replace: '' }],
    tests,
  },
]
