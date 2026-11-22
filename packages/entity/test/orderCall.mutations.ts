/**
 * Ordering by a call, broken in turn:
 * `pnpm mutate packages/entity/test/orderCall.mutations.ts`.
 */
const tests = ['packages/entity/test/orderCall.test.ts']
const expr = '../src/expr/order.ts'
const query = '../src/expr/query.ts'
const dependencies = '../src/expr/dependencies.ts'
const evaluate = '../src/evaluate.ts'
const rowOrder = '../src/rowOrder.ts'

export default [
  {
    name: "a call's term takes no collation from the call",
    edits: [
      {
        file: expr,
        find: '    : collationOf(expr.node)\n  // A number orders',
        replace: '    : Option.none<Collation>()\n  // A number orders',
      },
    ],
    tests,
  },
  {
    name: 'a call that orders nowhere alike is a term',
    edits: [
      {
        file: expr,
        find: '  if (isCall(expr.node)) orderableCall(expr.node, collation)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a number call is refused as a term',
    edits: [{ file: expr, find: "  if (kind === 'number') return\n", replace: '' }],
    tests,
  },
  {
    name: 'a call under a locale is a term',
    edits: [{ file: expr, find: "if (each._tag === 'Locale') {", replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a chosen call is not checked until chosen',
    edits: [
      {
        file: expr,
        find: '    if (!field) orderableCall(expr.node, collationOf(expr.node))\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a chosen alternative may not be a call',
    edits: [
      {
        file: expr,
        find: 'if (!field && !isCall(expr.node)) {',
        replace: 'if (!field) {',
      },
    ],
    tests,
  },
  {
    name: 'a call is placeable whatever the client runs',
    edits: [
      {
        file: query,
        find: 'const missing = missingFrom(\n            dependenciesOf(orderTerm.expr).operators,\n            operators,\n            operator => missingName(operator, operators),\n          )',
        replace: 'const missing: ReadonlyArray<string> = []',
      },
    ],
    tests,
  },
  {
    name: 'a defined operator in an order is said to need a table',
    edits: [
      {
        file: dependencies,
        find: '.filter(operator => Option.isNone(operator.definedAs) && !operators.has(operator))',
        replace: '.filter(operator => !operators.has(operator))',
      },
    ],
    tests,
  },
  // 'a primitive call (predicate) keeps a defined one among its arguments' are gone: a defined
  // call is already its body, so there is no expansion step to skip (the equivalent claim is
  // 'A primitive call over a defined operator' in orderCall.test.ts).
  {
    name: "an order's call reads no input",
    edits: [{ file: rowOrder, find: 'input: scope.input,', replace: 'input: {},' }],
    tests,
  },
  {
    name: 'evaluate orders a call over no input',
    edits: [
      {
        file: evaluate,
        find: '    { input, operators, context },\n',
        replace: '    { input: {}, operators, context },\n',
      },
    ],
    tests,
  },
  {
    name: 'compareRows ignores the input it is given',
    edits: [
      {
        file: rowOrder,
        find: 'input: options.input ?? {},\n    operators:',
        replace: 'input: {},\n    operators:',
      },
    ],
    tests,
  },
  {
    name: 'compareRows ignores the table it is given',
    edits: [
      {
        file: rowOrder,
        find: 'operators: options.operators ?? kernelOperators,\n    context: options.context,\n  }\n',
        replace: 'operators: kernelOperators,\n    context: options.context,\n  }\n',
      },
    ],
    tests,
  },
  {
    name: 'the evaluator orders by fields alone',
    edits: [
      {
        file: rowOrder,
        find: "if (!field && Option.isNone(originTagged(term.expr.node, 'Call'))) {",
        replace: 'if (!field) {',
      },
    ],
    tests,
  },
]
