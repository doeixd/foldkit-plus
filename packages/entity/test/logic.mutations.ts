/**
 * `and`, `or` and `not` in the IR and the evaluator, broken in turn:
 * `pnpm mutate packages/entity/test/logic.mutations.ts` checks that a test
 * fails for every one.
 */
const expr = '../src/expr.ts'
const evaluate = '../src/evaluate.ts'
const ir = ['packages/entity/test/expr.test.ts', 'packages/entity/test/query-values.test.ts']
const semantics = [
  'packages/remote-server/test/evaluate.test.ts',
  'packages/remote-server/test/conformance.test.ts',
]
const comparisons = [...ir, ...semantics]

export default [
  {
    name: 'an or nested in an or is kept as a node',
    edits: [
      {
        file: expr,
        find: "        Or: or => (kind === 'Or' ? or.operands : [or]),",
        replace: '        Or: or => [or],',
      },
    ],
    tests: ir,
  },
  {
    name: 'an and nested in an and is kept as a node',
    edits: [
      {
        file: expr,
        find: "        And: and => (kind === 'And' ? and.operands : [and]),",
        replace: '        And: and => [and],',
      },
    ],
    tests: ir,
  },
  {
    name: 'one operand is wrapped in a node',
    edits: [
      {
        file: expr,
        find: 'operands.length === 1 ? operands[0] :',
        replace: 'false ? operands[0] :',
      },
    ],
    tests: ir,
  },
  {
    name: 'no operands are taken',
    edits: [
      {
        file: expr,
        find: 'if (!Arr.isReadonlyArrayNonEmpty(operands)) {',
        replace: 'if (false) {',
      },
    ],
    tests: ir,
  },
  {
    name: 'a flattened list has no cap',
    edits: [
      { file: expr, find: 'if (operands.length > maxQueryNodes) {', replace: 'if (false) {' },
    ],
    tests: ir,
  },
  {
    name: 'the ownership check does not look under a connective',
    edits: [
      {
        file: expr,
        find: '      for (const operand of expr.operands) yield* fieldsIn(operand, seen)\n',
        replace: '',
      },
    ],
    tests: ir,
  },
  {
    name: 'a not is not named among the operations',
    edits: [{ file: expr, find: "found.operations.add('not')", replace: 'void 0' }],
    tests: ir,
  },
  {
    name: 'the budget counts a not as one node',
    edits: [
      {
        file: expr,
        find: "      return [expr.operand]\n    case 'Compare':",
        replace: "      return []\n    case 'Compare':",
      },
    ],
    tests: ir,
  },
  {
    name: 'an or inside an and is shown ungrouped',
    edits: [
      { file: expr, find: 'Or: () => `(${showExpr(node)})`', replace: 'Or: () => showExpr(node)' },
    ],
    tests: ir,
  },
  {
    name: 'an or among several wheres is shown ungrouped',
    edits: [
      {
        file: expr,
        find: 'self.where.length > 1 ? `(${Expr.show(or)})` : Expr.show(or)',
        replace: 'Expr.show(or)',
      },
    ],
    tests: ir,
  },
  {
    name: 'an and with a false operand is only unknown',
    edits: [
      { file: evaluate, find: '      if (truths.includes(false)) return false\n', replace: '' },
    ],
    tests: semantics,
  },
  {
    name: 'an or with a true operand is only unknown',
    edits: [
      { file: evaluate, find: '      if (truths.includes(true)) return true\n', replace: '' },
    ],
    tests: semantics,
  },
  {
    name: 'lt holds where the two order together',
    edits: [
      {
        file: evaluate,
        find: "Match.when('lt', () => order < 0)",
        replace: "Match.when('lt', () => order <= 0)",
      },
    ],
    tests: comparisons,
  },
  {
    name: 'a comparison ignores its collation',
    edits: [
      {
        file: evaluate,
        find: 'const order = compare(left, right, node.collation)',
        replace: 'const order = compare(left, right, Option.none())',
      },
    ],
    tests: comparisons,
  },
  {
    name: 'text with no collation is compared anyway',
    edits: [
      {
        file: expr,
        find: "  if (!kinds.has('text')) return Option.none()",
        replace: '  return Option.none()',
      },
    ],
    tests: comparisons,
  },
  {
    name: 'a locale is taken for a comparison',
    edits: [
      {
        file: expr,
        find: '      Locale: ({ locale }) => {\n        throw new Error(',
        replace: '      Locale: ({ locale }) => {\n        if (locale !== locale) throw new Error(',
      },
    ],
    tests: comparisons,
  },
  {
    name: 'a value that does not order is compared anyway',
    edits: [
      {
        file: expr,
        find: "  if (kinds.has('none') || kinds.size > 1) {",
        replace: '  if (false) {',
      },
    ],
    tests: comparisons,
  },
  {
    name: 'text compared with no field is taken',
    edits: [{ file: expr, find: '  if (first === undefined) {', replace: '  if (false) {' }],
    tests: comparisons,
  },
  {
    name: 'a comparison is not named among the operations',
    edits: [{ file: expr, find: "found.operations.add('compare')", replace: 'void 0' }],
    tests: comparisons,
  },
  {
    name: 'not of an unknown is true',
    edits: [
      {
        file: evaluate,
        find: "return truth === 'unknown' || isUnheld(truth) ? truth : !truth",
        replace: 'return isUnheld(truth) ? truth : truth !== true',
      },
    ],
    tests: semantics,
  },
]
