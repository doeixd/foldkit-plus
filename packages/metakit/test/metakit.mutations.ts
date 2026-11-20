/**
 * Mutation suite proving `metakit`'s tests catch broken folds, NULL/Unknown
 * conflation, Zone checks, and SQL lowering:
 *   `pnpm mutate packages/metakit/test/metakit.mutations.ts`
 */
const residualize = '../src/ops/residualize.ts'
const transition = '../src/transition.ts'
const zone = '../src/abstract/zone.ts'
const sql = '../src/sql.ts'
const prove = '../src/prove.ts'
const graph = '../src/graph.ts'
const check = '../src/abstract/check.ts'
const str = '../src/ops/str.ts'
const coreTests = ['packages/metakit/test/core.test.ts']
const sqlTests = ['packages/metakit/test/sql.test.ts']
const proveTests = ['packages/metakit/test/prove.test.ts']
const graphTests = ['packages/metakit/test/graph.test.ts']
const domainTests = ['packages/metakit/test/domain.test.ts']
const strArrTests = ['packages/metakit/test/str-arr.test.ts']

export default [
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
        find: 'if (!Boolean(evalNode(transition.when.node, env))) {',
        replace: 'if (false && !Boolean(evalNode(transition.when.node, env))) {',
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
        find: "const op = ctx.dialect === 'postgres' ? 'IS NOT DISTINCT FROM' : 'IS'",
        replace: "const op = '='",
      },
    ],
    tests: sqlTests,
  },
  {
    name: 'SQL refuses nothing for Opaque',
    edits: [
      {
        file: sql,
        find: 'new SqlUnsupportedError({ reason: `cannot lower opaque term "${name}" to SQL` })',
        replace: 'new SqlUnsupportedError({ reason: "wrong" })',
      },
    ],
    tests: sqlTests,
  },
  {
    name: 'Prove returns bogus False instead of Unknown on sat with Opaque term',
    edits: [
      {
        file: prove,
        find: 'if (opaqueVars.size > 0) {',
        replace: 'if (false && opaqueVars.size > 0) {',
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
        find: 'codePointLength(args[0])',
        replace: 'args[0].length',
      },
    ],
    tests: strArrTests,
  },
]
