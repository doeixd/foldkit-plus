/**
 * `contains`'s search, broken in turn:
 * `pnpm mutate packages/entity/test/contains.mutations.ts`.
 */
export default [
  {
    name: 'a search a row decides is accepted',
    edits: [
      {
        file: '../src/expr/text.ts',
        find: "if (!Node.$is('Lit')(sought) && Option.isNone(inputKeyOf(sought))) {",
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/entity/test/expr.test.ts'],
  },
]
