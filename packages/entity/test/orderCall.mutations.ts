/**
 * Ordering by a call, broken in turn:
 * `pnpm mutate packages/entity/test/orderCall.mutations.ts`.
 */
const tests = ['packages/entity/test/orderCall.test.ts']
const expr = '../src/expr.ts'
const evaluate = '../src/evaluate.ts'

export default [
  {
    name: "a call's term takes no collation from the call",
    edits: [
      { file: expr, find: "      Match.tag('Call', call => call.collation),\n", replace: '' },
    ],
    tests,
  },
  {
    name: 'a call that orders nowhere alike is a term',
    edits: [
      {
        file: expr,
        find: "  if (expr._tag === 'Call') orderableCall(expr, collation)\n",
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
        find: "      if (expr._tag === 'Call') orderableCall(expr, expr.collation)\n",
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
        find: "if (expr._tag !== 'Field' && expr._tag !== 'Call') {",
        replace: "if (expr._tag !== 'Field') {",
      },
    ],
    tests,
  },
  {
    name: 'a call is placeable whatever the client runs',
    edits: [
      {
        file: expr,
        find: 'const missing = missingFrom(dependenciesOf(call).operators, operators)',
        replace: 'const missing: ReadonlyArray<string> = []',
      },
    ],
    tests,
  },
  {
    name: 'a defined operator in an order is said to need a table',
    edits: [
      {
        file: expr,
        find: '.filter(operator => Option.isNone(operator.definedAs) && !operators.has(operator))',
        replace: '.filter(operator => !operators.has(operator))',
      },
    ],
    tests,
  },
  {
    name: 'a primitive call keeps a defined one among its arguments',
    edits: [
      {
        file: expr,
        find: 'onNone: () => node<AnyExpr>({ ...scalar, args: scalar.args.map(expandedSide) }),',
        replace: 'onNone: () => scalar,',
      },
    ],
    tests,
  },
  {
    name: 'a primitive predicate keeps a defined one among its arguments',
    edits: [
      {
        file: expr,
        find: 'onNone: () => node<Predicate>({ ...test, args: test.args.map(expandedSide) }),',
        replace: 'onNone: () => test,',
      },
    ],
    tests,
  },
  {
    name: "an order's call reads no input",
    edits: [{ file: evaluate, find: 'input: scope.input,', replace: 'input: {},' }],
    tests,
  },
  {
    name: 'evaluate orders a call over no input',
    edits: [
      {
        file: evaluate,
        find: '    { input, operators },\n',
        replace: '    { input: {}, operators },\n',
      },
    ],
    tests,
  },
  {
    name: 'compareRows ignores the input it is given',
    edits: [
      {
        file: evaluate,
        find: 'const scope = { input: options.input ?? {},',
        replace: 'const scope = { input: {},',
      },
    ],
    tests,
  },
  {
    name: 'compareRows ignores the table it is given',
    edits: [
      {
        file: evaluate,
        find: 'operators: options.operators ?? Operators.kernel }',
        replace: 'operators: Operators.kernel }',
      },
    ],
    tests,
  },
  {
    name: 'the evaluator orders by fields alone',
    edits: [
      {
        file: evaluate,
        find: "if (term.expr._tag !== 'Field' && term.expr._tag !== 'Call') {",
        replace: "if (term.expr._tag !== 'Field') {",
      },
    ],
    tests,
  },
]
