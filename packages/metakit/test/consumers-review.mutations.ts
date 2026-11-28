/**
 * Mutations proving the tests of metakit's consumers (`machine`, `inspect`,
 * `sql`, `drizzle`, `prove`, `graph`) catch what an independent review found
 * unguarded:
 *   `pnpm mutate packages/metakit/test/consumers-review.mutations.ts`
 */
const machine = '../src/machine.ts'
const can = '../src/can.ts'
const render = '../src/sqlRender.ts'
const statements = '../src/sqlStatements.ts'
const inspect = '../src/inspect.ts'
const sql = '../src/sql.ts'
const drizzle = '../src/drizzle.ts'
const lowering = '../src/sqlLowering.ts'
const proveLower = '../src/prove/lower.ts'
const proveShape = '../src/prove/shape.ts'
const proveSolve = '../src/prove/solve.ts'
const proveTransition = '../src/prove/transition.ts'
const proveWitness = '../src/prove/witness.ts'
const policy = '../src/policy.ts'
const proveTests = ['packages/metakit/test/prove-review.test.ts']
const graph = '../src/graph.ts'
const readiness = '../src/graph/readiness.ts'
const graphTests = ['packages/metakit/test/graph.test.ts']
const parityTests = ['packages/metakit/test/sql-parity.test.ts']
const integrationTests = ['packages/metakit/test/integrations.test.ts']
const loweringTests = ['packages/metakit/test/sql-lowering.test.ts']

const mutation = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  mutation(
    'a tag naming a member of Object.prototype is taken for a transition',
    machine,
    'Object.hasOwn(config.transitions, tag)',
    'config.transitions[tag] !== undefined',
    integrationTests,
  ),
  mutation(
    'a tag naming no transition can be dispatched',
    can,
    'onNone: () => Verdict.False(),',
    "onNone: () => Verdict.Unknown('no such transition'),",
    integrationTests,
  ),
  mutation(
    'a nullable enum lists no null',
    inspect,
    'enum: spec.nullable ? [...literals, null] : literals',
    'enum: literals',
    integrationTests,
  ),
  mutation(
    'the literals under NullOr are not read as an enum',
    inspect,
    '      if (present.length === 1) {',
    '      if (present.length === 1 && !SchemaAST.isUnion(present[0]!)) {',
    integrationTests,
  ),
  mutation(
    'the solver takes a nullable or optional path for one that is never null',
    proveShape,
    'const flags = mayBeAbsent ? [...above, flag] : above',
    'const flags = above',
    proveTests,
  ),
  mutation(
    'the solver reads a field under a nullable parent as always there',
    proveShape,
    "info('struct')\n    for (const property of inner.propertySignatures) {\n      if (typeof property.name === 'string') {\n        readShape(\n          property.type,\n          [...segments, property.name],\n          flags,",
    "info('struct')\n    for (const property of inner.propertySignatures) {\n      if (typeof property.name === 'string') {\n        readShape(\n          property.type,\n          [...segments, property.name],\n          above,",
    proveTests,
  ),
  mutation(
    'the solver takes the last case of a match for every value no case names',
    proveLower,
    'if (!isCovered(on)) {',
    'if (false) {',
    proveTests,
  ),
  mutation(
    'the solver compares text with a number',
    proveLower,
    "if (a.kind !== 'null' && b.kind !== 'null' && sorted(a.kind) !== sorted(b.kind)) {",
    'if (false) {',
    proveTests,
  ),
  mutation(
    'an assignment that does not replay is a counterexample',
    proveSolve,
    'valid(slices, env) && given.every(rule => holdsOf(rule, env)) && reproduces(env)',
    'true',
    proveTests,
  ),
  mutation(
    'a write to a parent leaves the fields a rule reads beneath it as they were',
    proveTransition,
    'if (Path.isPrefix(target, read)) {',
    'if (target.length === read.length && Path.isPrefix(target, read)) {',
    proveTests,
  ),
  mutation(
    'a written value is not held to a bound declared inside NullOr',
    proveTransition,
    'if (info.flags.length > 0) return fits.map(fit => call(orOp, isNull, fit))',
    'if (info.flags.length > 0) return []',
    proveTests,
  ),
  mutation(
    'an integer bound that is a fraction is handed to the solver as an integer',
    proveLower,
    'guard(whole ? made.ge(Math.floor(bound) + 1) : made.gt(bound))',
    'guard(made.gt(whole ? z3.Int.val(bound) : bound))',
    proveTests,
  ),
  mutation(
    'an integer result past the safe range is a value',
    proveLower,
    "return strict('num', [a!, b!], result, z3.Or(unsafe(x), unsafe(y), unsafe(result)))",
    "return strict('num', [a!, b!], result)",
    ['packages/metakit/test/prove.test.ts'],
  ),
  mutation(
    'the solver runs past its time',
    proveSolve,
    "solver.set('timeout', effectiveTimeout)",
    "solver.set('timeout', 600_000)",
    proveTests,
  ),
  mutation(
    'a timeout is reported as a nonlinear goal',
    proveSolve,
    'return /timeout|canceled/.test(why)',
    'return false',
    proveTests,
  ),
  mutation(
    'a failed load of the solver is kept',
    proveSolve,
    'loading.catch(() => {\n      loadedZ3 = Option.none()\n    })',
    'loading.catch(() => {})',
    ['packages/metakit/test/prove-unavailable.test.ts'],
  ),
  mutation(
    'a refuted transition reports no rule it breaks',
    proveWitness,
    "violated: broken.length > 0 ? broken : ['a check of the state Schema that is no rule'],",
    'violated: [],',
    proveTests,
  ),
  mutation(
    'a rule allows where it is null',
    policy,
    'onSuccess: value => value === true,',
    'onSuccess: value => value !== false,',
    ['packages/metakit/test/policy.test.ts'],
  ),
  mutation(
    'a query is ready although SQL cannot lower it',
    readiness,
    'onFailure: ({ reason }) => ({',
    'onFailure: ({ reason }): QueryReadiness<Env, A> => ({ ready: true, residual }) ?? ({',
    graphTests,
  ),
  mutation(
    'an empty row prefix reads every path as a missing parameter',
    readiness,
    'segs => !Path.isPrefix(rowPrefix, segs)',
    'segs => rowPrefix.length === 0 || !Path.isPrefix(rowPrefix, segs)',
    graphTests,
  ),
  mutation(
    'SQL takes the second branch of a choice whose condition is null',
    lowering,
    'q`(CASE WHEN ${c} THEN ${typedArm(then, t)} WHEN NOT ${c} THEN ${typedArm(otherwise, e)} END)`',
    'q`(CASE WHEN ${c} THEN ${typedArm(then, t)} ELSE ${typedArm(otherwise, e)} END)`',
    parityTests,
  ),
  mutation(
    'SQL leaves a null needle unknown among candidates that are not null',
    lowering,
    ': q`((${target} IS NOT NULL) AND ${among})`',
    ': among',
    parityTests,
  ),
  mutation(
    'SQL counts a null array as empty',
    lowering,
    'a => q`(${arrayLength(ctx.dialect)}(${a}) = 0)`',
    'a => q`(COALESCE(${arrayLength(ctx.dialect)}(${a}), 0) = 0)`',
    parityTests,
  ),
  mutation(
    'SQL equality is unknown of a null',
    lowering,
    "'eq.isNot': textEqual(byDialect('IS DISTINCT FROM', 'IS NOT')),",
    "'eq.isNot': textEqual(() => '<>'),",
    parityTests,
  ),
  mutation(
    'SQLite takes a prefix by the length of the text, not of the prefix',
    lowering,
    ': q`(substr(${s}, 1, length(${prefix})) COLLATE BINARY = ${prefix})`',
    ': q`(substr(${s}, 1, length(${s})) COLLATE BINARY = ${prefix})`',
    parityTests,
  ),
  mutation(
    'a quote in an identifier is not doubled',
    sql,
    `name.replaceAll('"', '""')`,
    'name',
    loweringTests,
  ),
  mutation(
    'a quote in an inlined text literal is not doubled',
    render,
    `value.replaceAll("'", "''")`,
    'value',
    loweringTests,
  ),
  mutation(
    'a non-finite number is lowered',
    lowering,
    "if (typeof value === 'number' && !Number.isFinite(value)) {",
    'if (false) {',
    loweringTests,
  ),
  mutation(
    'a NUL in text is lowered',
    lowering,
    "typeof value === 'string' && value.includes('\\u0000')",
    'false',
    loweringTests,
  ),
  mutation(
    'an empty candidate list is written IN ()',
    lowering,
    'if (candidates.length === 0) return',
    'if (false) return',
    loweringTests,
  ),
  mutation(
    'a list of only null is written IN ()',
    lowering,
    'if (items.length === 0) return Result.succeed(q`(${target} IS NULL)`)',
    'if (false) return Result.succeed(q`(${target} IS NULL)`)',
    loweringTests,
  ),
  mutation(
    'SQLite is handed a boolean to bind',
    render,
    "dialect === 'sqlite' && typeof value === 'boolean' ? (value ? 1 : 0) : value",
    'value',
    loweringTests,
  ),
  mutation(
    'two paths share one column name',
    render,
    'if (prior !== undefined && prior !== path) {',
    'if (false) {',
    loweringTests,
  ),
  mutation(
    'a fraction meets an integer term',
    lowering,
    'return mixed(left, right) || mixed(right, left)',
    'return false',
    loweringTests,
  ),
  mutation(
    'a fraction is a candidate for an integer term',
    lowering,
    'if (isIntegerTerm(args[0]!) && present.some(isFraction)) return',
    'if (false) return',
    loweringTests,
  ),
  mutation(
    'an UPDATE is built from an input the input Schema refuses',
    statements,
    '!Schema.is(transition.inputSchema.value)(input)',
    'false',
    loweringTests,
  ),
  mutation(
    'a CHECK passes a rule that is unknown of a null',
    statements,
    "text(') IS TRUE')",
    "text(')')",
    loweringTests,
  ),
  mutation(
    'Drizzle reads a column the table lacks',
    drizzle,
    'Object.hasOwn(columns, name)',
    'true',
    loweringTests,
  ),
  mutation(
    'Drizzle binds a literal of a CHECK as a parameter',
    drizzle,
    'options.inline',
    'false',
    loweringTests,
  ),
]
