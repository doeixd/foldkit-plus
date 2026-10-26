/**
 * `contains`'s search, broken in turn:
 * `pnpm mutate packages/entity/test/contains.mutations.ts`.
 */
export default [
  {
    name: 'a search a row decides is accepted',
    edits: [
      {
        file: '../src/expr.ts',
        find: "if (operand._tag !== 'Literal' && operand._tag !== 'Input') {",
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/entity/test/expr.test.ts'],
  },
]
