/**
 * `and`, `or` and `not` as metakit calls and the comparison checks, broken in
 * turn: `pnpm mutate packages/entity/test/logic.mutations.ts` checks that a
 * test fails for every one.
 */
const logic = '../src/expr/logic.ts'
const compare = '../src/expr/compare.ts'
const dependencies = '../src/expr/dependencies.ts'
const show = '../src/expr/show.ts'
const query = '../src/expr/query.ts'
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
        file: logic,
        find: "Node.$is('Call')(node) && node.op === op && Option.isNone(originOf(node))",
        replace:
          "Node.$is('Call')(node) && node.op === op && op.id !== 'bool.or' && Option.isNone(originOf(node))",
      },
    ],
    tests: ir,
  },
  {
    name: 'an and nested in an and is kept as a node',
    edits: [
      {
        file: logic,
        find: "Node.$is('Call')(node) && node.op === op && Option.isNone(originOf(node))",
        replace:
          "Node.$is('Call')(node) && node.op === op && op.id !== 'bool.and' && Option.isNone(originOf(node))",
      },
    ],
    tests: ir,
  },
  {
    name: 'one operand is wrapped in a node',
    edits: [
      {
        file: logic,
        find: "if (only !== undefined && rest.length === 0 && kindOf(only.node) === 'boolean') {",
        replace: 'if (false) {',
      },
    ],
    tests: ir,
  },
  {
    name: 'no operands are taken',
    edits: [{ file: logic, find: 'if (operands.length === 0) {', replace: 'if (false) {' }],
    tests: ir,
  },
  {
    name: 'a flattened list has no cap',
    edits: [
      { file: logic, find: 'if (operands.length > maxQueryNodes) {', replace: 'if (false) {' },
    ],
    tests: ir,
  },
  {
    name: 'a not is not named among the operations',
    edits: [{ file: dependencies, find: "  'bool.not': 'not',\n", replace: '' }],
    tests: ir,
  },
  {
    name: 'the budget counts a not as one node',
    edits: [
      {
        file: dependencies,
        find: "  if (Node.$is('Rows')(node)) return []\n  return childrenOf(node)",
        replace:
          "  if (Node.$is('Rows')(node)) return []\n  if (Node.$is('Call')(node) && node.op.id === 'bool.not') return []\n  return childrenOf(node)",
      },
    ],
    tests: ir,
  },
  {
    name: 'an or inside an and is shown ungrouped',
    edits: [
      {
        file: show,
        find: 'Option.isSome(connective(node)) ? `(${showNode(node)})` : showNode(node)',
        replace:
          'Option.isSome(connective(node)) && !isOr(node) ? `(${showNode(node)})` : showNode(node)',
      },
    ],
    tests: ir,
  },
  {
    name: 'an or among several wheres is shown ungrouped',
    edits: [
      { file: query, find: 'isOr(predicate.node) && self.where.length > 1', replace: 'false' },
    ],
    tests: ir,
  },
  {
    name: 'text with no collation is compared anyway',
    edits: [
      {
        file: compare,
        find: "  if (!kinds.has('text')) return Option.none()",
        replace: '  return Option.none()',
      },
    ],
    tests: comparisons,
  },
  {
    name: 'a locale is taken for a comparison',
    edits: [{ file: compare, find: "if (collation._tag === 'Locale') {", replace: 'if (false) {' }],
    tests: comparisons,
  },
  {
    name: 'a value that does not order is compared anyway',
    edits: [
      {
        file: compare,
        find: "if (kinds.has('boolean') || kinds.has('other') || kinds.size > 1) {",
        replace: 'if (false) {',
      },
    ],
    tests: comparisons,
  },
  {
    name: 'text compared with no field is taken',
    edits: [{ file: compare, find: '  if (first === undefined) {', replace: '  if (false) {' }],
    tests: comparisons,
  },
  {
    name: 'a comparison is not named among the operations',
    edits: [{ file: dependencies, find: "found.operations.add('compare')", replace: 'void 0' }],
    tests: comparisons,
  },
]
