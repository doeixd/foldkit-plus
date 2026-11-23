const tests = ['packages/metakit/test/soundness15.test.ts']

export default [
  {
    name: 'Transition.step allows a null guard to pass',
    edits: [
      {
        file: '../src/transition.ts',
        find: 'if (evalNode(transition.when.node, env, options?.foreign) !== true) {',
        replace: 'if (evalNode(transition.when.node, env, options?.foreign) === false) {',
      },
    ],
    tests,
  },
  {
    name: 'SQL lowerCheck treats absent optional key as failing',
    edits: [
      {
        file: '../src/sqlStatements.ts',
        find: 'info !== undefined && info.optional',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'Prover skips optional key nullable guard on schema rules',
    edits: [
      {
        file: '../src/prove/solve.ts',
        find: 'if (info === undefined || !info.optional) return node',
        replace: 'return node',
      },
    ],
    tests,
  },
  {
    name: 'Rows.sum drops safe-integer range check on integer totals',
    edits: [
      {
        file: '../src/ops/rows.ts',
        find: 'return exact <= BigInt(Number.MAX_SAFE_INTEGER) && exact >= BigInt(-Number.MAX_SAFE_INTEGER)',
        replace: 'return true',
      },
    ],
    tests,
  },
]
