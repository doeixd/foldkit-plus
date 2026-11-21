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

const check = '../src/abstract/check.ts'
const entail = '../src/abstract/entail.ts'
const fields = '../src/abstract/fields.ts'
const fits = '../src/abstract/fits.ts'
const abstractOps = '../src/abstract/ops.ts'
const abstractState = '../src/abstract/state.ts'
const interval = '../src/abstract/interval.ts'
const zone = '../src/abstract/zone.ts'

const nullStrict = ['packages/metakit/test/null-strict.test.ts']
const soundness = ['packages/metakit/test/abstract-soundness.test.ts']
const conformance = ['packages/metakit/test/conformance.test.ts']

const mutation = (
  tests: ReadonlyArray<string>,
  name: string,
  file: string,
  find: string,
  replace: string,
) => ({ name, edits: [{ file, find, replace }], tests })

const checker = [
  mutation(
    soundness,
    'a strict rule over reals tightens by one',
    entail,
    'const delta = strict ? (bothInt ? -1 : 0) : 0',
    'const delta = strict ? -1 : 0',
  ),
  mutation(
    soundness,
    'a strict goal is proved from a bound that is not strict',
    entail,
    'const slack = strict && bothInt ? 1 : 0',
    'const slack = 0',
  ),
  mutation(
    soundness,
    'an exclusive minimum on a real is tightened as if it were an integer',
    fields,
    'Interval.between(isInt ? Math.floor(m) + 1 : m, Infinity)',
    'Interval.between(Math.floor(m) + 1, Infinity)',
  ),
  mutation(
    soundness,
    'membership bounds a number by its smallest candidate',
    abstractOps,
    'numbers.length === values.length) {\n        state.zone.constrainLower(id.value, Math.min(...numbers))\n        state.zone.constrainUpper(id.value, Math.max(...numbers))',
    'numbers.length === values.length) {\n        state.zone.constrainLower(id.value, Math.min(...numbers))\n        state.zone.constrainUpper(id.value, Math.min(...numbers))',
  ),
  mutation(
    soundness,
    'a sum is bounded by the lower end of what is added',
    entail,
    'if (Number.isFinite(riv.hi)) tighten(id, lv.value, riv.hi)',
    'if (Number.isFinite(riv.lo)) tighten(id, lv.value, riv.lo)',
  ),
  mutation(
    nullStrict,
    'subtraction declares zero a left identity',
    '../src/properties.ts',
    "identity: { value: 0, side: 'right' },",
    "identity: { value: 0, side: 'both' },",
  ),
  mutation(
    soundness,
    'a conditional is decided from the branch taken',
    entail,
    '...(skipped.propagate() ? [skipped.entails(branch.otherwise, 0)] : []),',
    '',
  ),
  mutation(
    soundness,
    'a conditional over a condition that may be null is decided',
    entail,
    'if (!this.hasValue(branch.cond)) return this.unvalued(branch.cond)',
    '',
  ),
  mutation(
    soundness,
    'a rule is read off the struct a write replaced',
    check,
    'if (Path.isPrefix(target, read)) {',
    'if (target.length === read.length && Path.isPrefix(target, read)) {',
  ),
  mutation(
    soundness,
    'a struct write is not held to its fields',
    check,
    'overall = Verdict.and(overall, state.fits(part, info))',
    "overall = Verdict.and(overall, proved('zone'))",
  ),
  mutation(
    soundness,
    'a write to an integer field need not be an integer',
    fits,
    'if (info.isInt && !state.isIntNode(value)) return unknown',
    '',
  ),
  mutation(
    soundness,
    'a write to a field that takes no null may be null',
    fits,
    'if (!acceptsNull && !this.hasValue(value)) return this.unvalued(value)',
    '',
  ),
  mutation(
    soundness,
    'an optional key is taken to be present',
    fields,
    'under || members.length !== flat(ast).length || SchemaAST.isOptional(ast)',
    'under || members.length !== flat(ast).length',
  ),
  mutation(
    soundness,
    'a field under a nullable struct is taken to be present',
    fields,
    'collectFields(property.type, [...prefix, property.name], fields, nullable)',
    'collectFields(property.type, [...prefix, property.name], fields, false)',
  ),
  mutation(
    soundness,
    'a rule on an absent field is a fact about it',
    check,
    'if (info === undefined || !info.nullable) return node',
    'if (true) return node',
  ),
  mutation(
    soundness,
    'arithmetic is never refused',
    abstractState,
    'Interval.within(this.evalInterval(node), SAFE)',
    'true',
  ),
  mutation(
    soundness,
    'a sum of doubles relates exactly to its operands',
    abstractState,
    "if (relation !== 'none' && isInt && args.length === 2) {",
    "if (relation !== 'none' && args.length === 2) {",
  ),
  mutation(
    soundness,
    'a comparison over an operand that may be null is decided',
    entail,
    'if (open !== undefined) return this.unvalued(open)',
    '',
  ),
  mutation(
    soundness,
    'two numbers that may be null are equal by their intervals',
    abstractOps,
    "if (!state.hasValue(a) || !state.hasValue(b)) return Verdict.Unknown('an operand may be null')",
    '',
  ),
  mutation(
    soundness,
    'a disjunction is proved by cases on a disjunct that may be null',
    abstractOps,
    'if (!Verdict.isUnknown(direct) || !state.hasValue(a) || !state.notRefused(b)) return direct',
    'if (!Verdict.isUnknown(direct) || !state.notRefused(b)) return direct',
  ),
  mutation(
    soundness,
    'a search for the empty string holds of a text that may be null',
    entail,
    'const open = call.args.find(arg => !this.hasValue(arg))',
    'const open = call.args.find(arg => !this.hasValue(arg) && !Node.$is("Path")(arg))',
  ),
  mutation(
    soundness,
    'an interval bound of a sum rounds to nearest',
    interval,
    'return norm(error * toward > 0 ? sum + toward * ulp(sum) : sum)',
    'return norm(sum)',
  ),
  mutation(
    conformance,
    'a zone bound of a sum rounds to nearest',
    zone,
    'return error > 0 ? sum + Math.abs(sum) * Number.EPSILON : sum',
    'return sum',
  ),
  mutation(
    conformance,
    'a path that is not null is taken to hold no NaN',
    abstractOps,
    'if (literal === null) {\n    state.markNotNull(term)',
    'if (literal === null) {\n    state.markValued(term)',
  ),
]

const path = '../src/path.ts'
const edges = ['packages/metakit/test/transition-path.test.ts']

const transitions = [
  mutation(
    edges,
    'a write under the target of another is taken',
    transition,
    'if (inner !== undefined) {',
    'if (false) {',
  ),
  mutation(
    edges,
    'an input outside its Schema is run',
    transition,
    '!accepts(transition.inputSchema.value)(input)',
    'false',
  ),
  mutation(
    edges,
    'a lifted transition writes into a child that is not there',
    '../src/transitionLift.ts',
    "args: [Node.Path({ segments: ['state', ...path.segments], ast: path.ast })],",
    'args: [Node.Lit({ value: 1 })],',
  ),
  mutation(
    edges,
    'a lifted opaque term runs over a child that is not there',
    '../src/transitionLift.ts',
    'state === null || state === undefined ? null : fn({ ...outer, state }),',
    'fn({ ...outer, state }),',
  ),
  mutation(
    edges,
    'the reads of the state keep their root',
    transition,
    "all.filter(segments => segments[0] === 'state').map(segments => segments.slice(1)),",
    "all.filter(segments => segments[0] === 'state'),",
  ),
  mutation(
    edges,
    'a write into an array makes it an object',
    path,
    'if (Array.isArray(current) && ARRAY_INDEX.test(key) && Number(key) <= current.length) {',
    'if (false) {',
  ),
  mutation(
    edges,
    'a match takes a key that is not a case',
    expr,
    'if (extra.length > 0) {',
    'if (false) {',
  ),
  mutation(
    edges,
    'a match leaves a value without a case',
    expr,
    'if (missing.length > 0) {',
    'if (false) {',
  ),
]

export default [
  ...checker,
  ...transitions,
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
    'Number.isNaN(value) ? Node.unordered(id) : undefined',
    'undefined',
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
    'evalNode(expr.node, env, options?.foreign) === true',
    'evalNode(expr.node, env, options?.foreign) !== false',
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
    'if (laws.reflexive !== undefined && same && isPortableRead(left)) {',
    'if (laws.reflexive !== undefined && same) {',
  ),
  mutation(
    nullStrict,
    'a part of a struct is read as the whole',
    residualize,
    'return raw || isWhole(current, ast) ? Option.some(current) : Option.none()',
    'return Option.some(current)',
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
    'a refused evaluation is judged with the kind of an unsupported operation',
    residualize,
    "Option.some({ kind: 'refused', detail: residual.value.message }),",
    "Option.some({ kind: 'unsupported', detail: residual.value.message }),",
  ),
  mutation(
    nullStrict,
    'a known null is judged unknown',
    residualize,
    'if (!Node.isRefusal(residual.value)) return Verdict.False()',
    "if (residual.value === false) return Verdict.False()\n    if (residual.value === null) return Verdict.Unknown('null')",
  ),
]
