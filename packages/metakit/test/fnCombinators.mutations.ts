/**
 * Mutation specification for `metakit/fn` combinators.
 * Run with: `pnpm mutate packages/metakit/test/fnCombinators.mutations.ts`
 */
export default [
  {
    name: 'compose drops second function where clauses',
    edits: [
      {
        file: '../src/fn.ts',
        find: 'whereClauses: [...f.whereClauses, ...gWheres],',
        replace: 'whereClauses: [...f.whereClauses],',
      },
    ],
    tests: ['packages/metakit/test/fnCombinators.test.ts'],
  },
  {
    name: 'partial drops whereClauses substitution',
    edits: [
      {
        file: '../src/fn.ts',
        find: `    whereClauses: f.whereClauses.map(w =>
      wrap<ParamValues<Remaining>, boolean | null>(sub(w.node)),
    ),`,
        replace: '    whereClauses: [],',
      },
    ],
    tests: ['packages/metakit/test/fnCombinators.test.ts'],
  },
  {
    name: 'iterate skips loop iterations',
    edits: [
      {
        file: '../src/fn.ts',
        find: 'for (let i = 1; i < n; i++) {',
        replace: 'for (let i = 1; i < 1; i++) {',
      },
    ],
    tests: ['packages/metakit/test/fnCombinators.test.ts'],
  },
  {
    name: 'ifElse swaps then and otherwise branches',
    edits: [
      {
        file: '../src/fn.ts',
        find: 'Node.If({ cond: cond.body.node, then: onTrue.body.node, otherwise: onFalse.body.node }),',
        replace:
          'Node.If({ cond: cond.body.node, then: onFalse.body.node, otherwise: onTrue.body.node }),',
      },
    ],
    tests: ['packages/metakit/test/fnCombinators.test.ts'],
  },
]
