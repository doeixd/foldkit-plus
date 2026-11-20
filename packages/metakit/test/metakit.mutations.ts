/**
 * Mutation suite proving `metakit`'s tests catch broken folds, NULL/Unknown
 * conflation, Zone checks, and SQL lowering:
 *   `pnpm mutate packages/metakit/test/metakit.mutations.ts`
 */
const residualize = '../src/ops/residualize.ts'
const transition = '../src/transition.ts'
const zone = '../src/abstract/zone.ts'
const sql = '../src/sql.ts'
const coreTests = ['packages/metakit/test/core.test.ts']
const sqlTests = ['packages/metakit/test/sql.test.ts']

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
]
