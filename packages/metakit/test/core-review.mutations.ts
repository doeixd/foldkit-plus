/**
 * Mutations of the evaluator, the laws, the abstract checker, transitions and
 * conformance, each in the direction of a wrong answer:
 *   `pnpm mutate packages/metakit/test/core-review.mutations.ts`
 */
const node = '../src/node.ts'
const expr = '../src/expr.ts'
const transition = '../src/transition.ts'
const evaluate = '../src/ops/eval.ts'
const residualize = '../src/ops/residualize.ts'
const bool = '../src/ops/bool.ts'
const num = '../src/ops/num.ts'
const ord = '../src/ops/ord.ts'

const nullStrict = ['packages/metakit/test/null-strict.test.ts']

const mutation = (
  tests: ReadonlyArray<string>,
  name: string,
  file: string,
  find: string,
  replace: string,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  mutation(
    nullStrict,
    'a strict operator computes over a null operand',
    node,
    'if (values.includes(null)) return null',
    'if (values.includes(null) && false) return null',
  ),
  mutation(
    nullStrict,
    'null hides the false of a conjunction',
    bool,
    'if (args.includes(decided)) return decided',
    'if (args.includes(decided) && !args.includes(null)) return decided',
  ),
  mutation(
    nullStrict,
    'an integer past the safe range is returned',
    num,
    'if (args.every(Number.isSafeInteger) && !Number.isSafeInteger(result)) {',
    'if (false) {',
  ),
  mutation(
    nullStrict,
    'a non-finite result is returned',
    num,
    'if (!Number.isFinite(result)) {',
    'if (false) {',
  ),
  mutation(
    nullStrict,
    'NaN is ordered',
    ord,
    'if (Number.isNaN(a) || Number.isNaN(b)) {',
    'if (false) {',
  ),
  mutation(
    nullStrict,
    'a rule that is null passes a refinement',
    expr,
    'return evalNode(exprNode, input) === true',
    'return evalNode(exprNode, input) !== false',
  ),
  mutation(
    nullStrict,
    'a rule that is null holds',
    expr,
    'evalNode(expr.node, env) === true',
    'evalNode(expr.node, env) !== false',
  ),
  mutation(
    nullStrict,
    'a guard that is null fires',
    transition,
    'if (evalNode(transition.when.node, env) !== true) {',
    'if (evalNode(transition.when.node, env) === false) {',
  ),
  mutation(
    nullStrict,
    'a refused write is written',
    transition,
    'if (refusals.length > 0) {',
    'if (false) {',
  ),
  mutation(
    nullStrict,
    'a null condition takes a branch',
    evaluate,
    'if (cond === null || Node.isRefusal(cond)) return { value: cond }',
    'if (cond === null) return { arm: node.otherwise }\n  if (Node.isRefusal(cond)) return { value: cond }',
  ),
  mutation(
    nullStrict,
    'a match with no fallback refuses null',
    evaluate,
    'if (target === null) return { value: null }',
    'if (false) return { value: null }',
  ),
  mutation(
    nullStrict,
    'an identity law returns an operand of any kind',
    residualize,
    'isLitEqual(right, value) && ofKind(left)) {',
    'isLitEqual(right, value)) {',
  ),
  mutation(
    nullStrict,
    'equality of a term with itself is true though the term may be refused',
    residualize,
    'if (laws.reflexive !== undefined && same && isRead(left)) {',
    'if (laws.reflexive !== undefined && same) {',
  ),
  mutation(
    nullStrict,
    'a part of a struct is read as the whole',
    residualize,
    'return current === undefined || !isWhole(current, ast) ? Option.none() : Option.some(current)',
    'return current === undefined ? Option.none() : Option.some(current)',
  ),
  mutation(
    nullStrict,
    'non-finite literals share a key',
    node,
    "if (typeof value === 'number') return `number:${value === 0 ? '0' : String(value)}`",
    "if (typeof value === 'number') return `number:${JSON.stringify(value)}`",
  ),
  mutation(
    nullStrict,
    'a known null is judged unknown',
    residualize,
    'if (!Node.isRefusal(residual.value)) return Verdict.False()',
    "if (residual.value === false) return Verdict.False()\n    if (residual.value === null) return Verdict.Unknown('null')",
  ),
]
