/**
 * Mutations proving the tests of `Expr.rulesOf` and the `Inspect` bounds catch
 * a lost message, path or bound:
 *   `pnpm mutate packages/metakit/test/rules.mutations.ts`
 */
const expr = '../src/expr.ts'
const rulesTests = ['packages/metakit/test/rules.test.ts']

const rule = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests: rulesTests,
})

export default [
  rule('rulesOf drops the message', expr, 'message: rule.message,', 'message: Option.none(),'),
  rule('rulesOf drops the property path', expr, 'at: rule.at,', 'at: [],'),
  rule(
    "a check inside a group ignores the group's message",
    expr,
    'Option.orElse(Option.fromUndefinedOr(ann?.message), () => groupMessage)',
    'Option.fromUndefinedOr(ann?.message)',
  ),
  rule(
    'isBetween ignores an exclusive minimum',
    expr,
    "flag('exclusiveMinimum') ? gtOp : gteOp",
    'gteOp',
  ),
]
