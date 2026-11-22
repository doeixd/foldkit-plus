/**
 * The domain guide's readers, each broken in turn:
 * `pnpm mutate examples/writes/test/domainGuide.mutations.ts`.
 */
const tests = ['examples/writes/test/domainGuide.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the check calls a write kept though it sets a member the invariant reads',
    '../../../packages/entity/src/laws.ts',
    "if (write._tag === 'Update' && !transition && disjoint(writtenKeys(write), reads))",
    "if (write._tag === 'Update' && !transition)",
  ),
  edit(
    'a page with no row answers Yes',
    '../../../packages/remote/src/canOf.ts',
    'if (Option.isNone(found)) return Can.undecided([`${entity.name} ${id} is not held`])',
    'if (Option.isNone(found)) return Verdict.True()',
  ),
  edit(
    'the reference interpreter orders a descending term ascending',
    '../../../packages/entity/src/expr/order.ts',
    "term('desc', orderOperand(expr, 'desc'), options)",
    "term('asc', orderOperand(expr, 'desc'), options)",
  ),
]
