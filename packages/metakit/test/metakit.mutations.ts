/**
 * Mutation suite proving `metakit`'s tests catch broken folds, NULL/Unknown
 * conflation, Zone checks, and SQL lowering:
 *   `pnpm mutate packages/metakit/test/metakit.mutations.ts`
 */
const residualize = '../src/ops/residualize.ts'
const transition = '../src/transition.ts'
const zone = '../src/abstract/zone.ts'
const sql = '../src/sqlLowering.ts'
const prove = '../src/prove.ts'
const graph = '../src/graph.ts'
const check = '../src/abstract/check.ts'
const str = '../src/ops/str.ts'
const temporal = '../src/temporal.ts'
const coreTests = ['packages/metakit/test/core.test.ts']
const sqlTests = ['packages/metakit/test/sql.test.ts']
const proveTests = ['packages/metakit/test/prove.test.ts']
const graphTests = ['packages/metakit/test/graph.test.ts']
const domainTests = ['packages/metakit/test/domain.test.ts']
const strArrTests = ['packages/metakit/test/str-arr.test.ts']
const temporalTests = ['packages/metakit/test/temporal.test.ts']
const policyTests = ['packages/metakit/test/policy.test.ts']

const policy = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests: policyTests,
})
const unordered = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests: ['packages/metakit/test/unordered.test.ts'],
})

export default [
  policy(
    'the Zone proves an implication over a number that may be NaN',
    '../src/policy.ts',
    'return ordered(verdict, slicesOf(policy), [fromRule.node, toRule.node])',
    'return verdict',
  ),
  policy(
    'the Zone calls dead a rule that NaN passes',
    '../src/policy.ts',
    'ordered(Verdict.False<never>(), slicesOf(policy), [target.node])',
    'Verdict.False<never>()',
  ),
  policy(
    'the solver proves a policy goal over a number that may be NaN',
    prove,
    "if (nanReads.size > 0 && status === 'unsat') {",
    'if (false) {',
  ),
  unordered(
    'the Zone proves an invariant over a number that may be NaN',
    check,
    "onSome: info => info.kind !== 'number' || info.finite,",
    'onSome: () => true,',
  ),
  unordered(
    'the solver proves an invariant over a number that may be NaN',
    prove,
    "if (nanReads.size > 0 && status === 'unsat') {",
    'if (false) {',
  ),
  unordered(
    'the solver proves a transition over a number that may be NaN',
    prove,
    "if (nanReads.size > 0 && status === 'unsat') {",
    'if (false) {',
  ),
  unordered(
    'a counterexample over a number that may be NaN is thrown away',
    '../src/abstract/unordered.ts',
    '(Verdict.isFalse(verdict) && Option.isNone(verdict.witness))',
    'Verdict.isFalse(verdict)',
  ),
  policy(
    'a refutation with no witness stands over a number that may be NaN',
    '../src/abstract/unordered.ts',
    'Verdict.isTrue(verdict) || (Verdict.isFalse(verdict) && Option.isNone(verdict.witness))',
    'Verdict.isTrue(verdict)',
  ),
  policy(
    'a null that a rule compares is ordered',
    '../src/abstract/unordered.ts',
    ': compared && nullableNumber(current)',
    ': false',
  ),
  policy(
    'a null that no rule compares stops a proof',
    '../src/abstract/unordered.ts',
    ': compared && nullableNumber(current)',
    ': nullableNumber(current)',
  ),
  policy(
    'a number whose key may be absent is ordered',
    '../src/abstract/unordered.ts',
    '? absent || Schema.is(Schema.make(current))(NaN)',
    '? Schema.is(Schema.make(current))(NaN)',
  ),
  policy(
    'a path of no known sort is an integer to the solver',
    prove,
    "return info('real', { nan: Schema.is(Schema.make<Schema.Top>(ast))(Number.NaN) })",
    "return info('int', { nan: Schema.is(Schema.make<Schema.Top>(ast))(Number.NaN) })",
  ),
  {
    name: 'mixed literal sorts silently alias text with numbers',
    edits: [
      {
        file: prove,
        find: "if (info.sort === 'other' && info.literals.length > 0) {",
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/metakit/test/policy.test.ts'],
  },
  {
    name: 'a policy implication is refuted without showing the update is reachable',
    edits: [
      {
        file: '../src/policy.ts',
        find: 'if (Verdict.isFalse(verdict))',
        replace: 'if (false)',
      },
    ],
    tests: ['packages/metakit/test/policy.test.ts'],
  },
  {
    name: 'a satisfiable policy model skips concrete validation',
    edits: [
      {
        file: prove,
        find: 'valid(slices, env) && given.every(rule => holdsOf(rule, env)) && reproduces(env)',
        replace: 'true',
      },
    ],
    tests: ['packages/metakit/test/policy.test.ts'],
  },
  {
    name: 'lookupPartial conflates null with missing (Unknown)',
    edits: [
      {
        file: residualize,
        find: 'if (next === undefined) return Option.none()',
        replace: 'if (next === undefined || next === null) return Option.none()',
      },
    ],
    tests: coreTests,
  },
  {
    name: 'Transition.step skips when guard',
    edits: [
      {
        file: transition,
        find: 'if (evalNode(transition.when.node, env) !== true) {',
        replace: 'if (false && evalNode(transition.when.node, env) !== true) {',
      },
    ],
    tests: coreTests,
  },
  {
    name: 'Transition.make allows duplicate write targets',
    edits: [
      {
        file: transition,
        find: 'if (seenTargets.has(targetKey)) {',
        replace: 'if (false && seenTargets.has(targetKey)) {',
      },
    ],
    tests: coreTests,
  },
  {
    name: 'Zone.impliesDiff always returns false',
    edits: [
      {
        file: zone,
        find: 'return this.m[i]![j]! <= bound',
        replace: 'return false',
      },
    ],
    tests: coreTests,
  },
  {
    name: 'SQL is uses plain = instead of NULL-safe IS NOT DISTINCT FROM',
    edits: [
      {
        file: sql,
        find: "'eq.is': numeric(byDialect('IS NOT DISTINCT FROM', 'IS')),",
        replace: "'eq.is': numeric(() => '='),",
      },
    ],
    tests: sqlTests,
  },
  {
    name: 'SQL refuses nothing for Opaque',
    edits: [
      {
        file: sql,
        find: 'Opaque: ({ name }) => unsupported(`cannot lower opaque term "${name}" to SQL`),',
        replace: 'Opaque: () => unsupported("wrong"),',
      },
    ],
    tests: sqlTests,
  },
  {
    name: 'Prove returns bogus False instead of Unknown on sat with Opaque term',
    edits: [
      {
        file: prove,
        find: 'if (opaque.size > 0) {',
        replace: 'if (false) {',
      },
    ],
    tests: proveTests,
  },
  {
    name: 'Prove.machine accepts blank allowUnknown reason',
    edits: [
      {
        file: prove,
        find: 'if (reason.trim().length === 0) {',
        replace: 'if (reason.length < 0) {',
      },
    ],
    tests: proveTests,
  },
  {
    name: 'Prove.machine ignores broken pin',
    edits: [
      {
        file: prove,
        find: "const pinBroken = pinned && status !== 'proved'",
        replace: 'const pinBroken = false',
      },
    ],
    tests: proveTests,
  },
  {
    name: 'Graph.analyze drops reverse Path.isPrefix overlap (child write -> parent read)',
    edits: [
      {
        file: graph,
        find: 'Path.isPrefix(a, b) || Path.isPrefix(b, a)',
        replace: 'Path.isPrefix(b, a)',
      },
    ],
    tests: graphTests,
  },
  {
    name: 'AbstractState.matchCandidates drops null branch on nullable enum',
    edits: [
      {
        file: check,
        find: '[...info.literals.value, null]',
        replace: 'info.literals.value',
      },
    ],
    tests: domainTests,
  },
  {
    name: 'Str.len uses UTF-16 .length instead of Unicode code-point count',
    edits: [
      {
        file: str,
        find: "typeof text === 'string' ? codePointLength(text)",
        replace: "typeof text === 'string' ? text.length",
      },
    ],
    tests: strArrTests,
  },
  {
    name: 'Temporal.checkStoreCapabilities skips parent-row-lock requirement',
    edits: [
      {
        file: temporal,
        find: "if (needsLock && !store.supportsParentRowLock && store.isolation !== 'serializable')",
        replace: 'if (false)',
      },
    ],
    tests: temporalTests,
  },
  {
    name: 'Temporal.runWalk settles out-of-order schedule in-order instead',
    edits: [
      {
        file: temporal,
        find: "        { kind: 'respond', seq: 1, response: r1 },\n        { kind: 'respond', seq: 0, response: r0 },",
        replace:
          "        { kind: 'respond', seq: 0, response: r0 },\n        { kind: 'respond', seq: 1, response: r1 },",
      },
    ],
    tests: temporalTests,
  },
]
