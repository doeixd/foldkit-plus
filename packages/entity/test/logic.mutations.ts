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

export default [
  {
    name: 'a connective of the same kind nests instead of flattening',
    edits: [
      {
        file: expr,
        find: 'return operand._tag === kind ? (operand as AndPredicate | OrPredicate).operands : [operand]',
        replace: 'return [operand]',
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
        find: '      return [expr.operand]\n  }\n}',
        replace: '      return []\n  }\n}',
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
    name: 'not of an unknown is true',
    edits: [
      {
        file: evaluate,
        find: "return truth === 'unknown' ? 'unknown' : !truth",
        replace: 'return truth !== true',
      },
    ],
    tests: semantics,
  },
]
